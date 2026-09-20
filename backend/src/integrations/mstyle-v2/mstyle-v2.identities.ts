import { MstyleEventsService } from './mstyle-v2.events';
import { problem } from './mstyle-v2.problem';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AUTH_CONNECTION } from '../../database/auth-database.constants';
import { Office, OfficeDocument, User, UserDocument } from '../../schemas';
import { normalizeRuMobilePhone } from '../../common/phone';
import { officeAssignedToQuery } from '../../common/office-tenants';
import { Ids } from './mstyle-v2.ids';
import {
  encryptJson,
  hmacHex,
  maskContact,
  normalizeEmail,
} from './mstyle-v2.crypto';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  MstyleContact,
  MstyleContactDocument,
  MstyleIdentity,
  MstyleIdentityDocument,
  MstyleMembership,
  MstyleMembershipDocument,
  MstyleProfile,
  MstyleProfileDocument,
} from './mstyle-v2.schemas';
import { nowIso } from './mstyle-v2.present';
import {
  defaultProfileType,
  deriveIdentityStatus,
  normalizeLegalForm,
} from '../../common/pass-identity';
import { EMPLOYEE_SLOT_STATUSES } from './mstyle-v2.membership-policy';

export function identityStatusFromUser(
  user: UserDocument | Record<string, any>,
) {
  return deriveIdentityStatus(user);
}

export function normalizeOfficeExternalIds(
  offices: Array<{ externalId?: string | null }>,
): string[] {
  return [
    ...new Set(
      offices
        .map((office) => office.externalId?.trim())
        .filter((id): id is string => !!id),
    ),
  ].sort();
}

export type MstyleAdminProfileState = {
  exists: boolean;
  profileId: string | null;
  status: 'draft' | 'active' | 'suspended' | 'closed' | 'deleted' | null;
  residentHoursMonthlyQuotaMin: number;
  residentHoursMonthlyResetDay: number;
  resourceRole: 'standalone' | 'primary' | 'secondary';
  resourceOwnerProfileId: string | null;
  resourceOwnerUserId: string | null;
  secondaryUserIds: string[];
};

@Injectable()
export class MstyleIdentityService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly events: MstyleEventsService,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly users: Model<UserDocument>,
    @InjectModel(MstyleIdentity.name)
    private readonly identities: Model<MstyleIdentityDocument>,
    @InjectModel(MstyleProfile.name)
    private readonly profiles: Model<MstyleProfileDocument>,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembershipDocument>,
    @InjectModel(MstyleContact.name)
    private readonly contacts: Model<MstyleContactDocument>,
    @InjectModel(Office.name)
    private readonly offices: Model<OfficeDocument>,
  ) {}

  async findUserByLogin(loginRaw: string) {
    const identity = await this.findIdentityByLogin(loginRaw);
    if (identity)
      return identity.userId
        ? this.users.findById(identity.userId).select('+password').session(null)
        : null;
    const login = loginRaw.trim().toLowerCase();
    const phone = normalizeRuMobilePhone(loginRaw);
    const or: Record<string, string>[] = [
      { username: login },
      { email: login },
    ];
    if (phone) or.push({ phone });
    const user = await this.users
      .findOne({ $or: or })
      .select('+password')
      .session(null);
    if (!user) return null;
    // An imported account must be addressed through its current integration identifiers.
    return (await this.findLinkedIdentity(user)) ? null : user;
  }

  async findUserByIdentifier(type: 'phone' | 'email', value: string) {
    if (type === 'phone') {
      const phone = normalizeRuMobilePhone(value);
      if (!phone) return null;
      return this.users.findOne({ phone }).select('+password').session(null);
    }
    return this.users
      .findOne({ email: normalizeEmail(value) })
      .select('+password')
      .session(null);
  }

  async findIdentityBySubject(subject: string) {
    return this.refreshUserSecurity(
      await this.identities.findOne({ subject, isDummy: { $ne: true } }),
    );
  }

  async findIdentityByIdentifier(type: 'phone' | 'email', value: string) {
    if (type === 'phone') {
      const phone = normalizeRuMobilePhone(value);
      if (!phone) return null;
      return this.refreshUserSecurity(
        await this.identities.findOne({ phone, isDummy: { $ne: true } }),
      );
    }
    return this.refreshUserSecurity(
      await this.identities.findOne({
        email: normalizeEmail(value),
        isDummy: { $ne: true },
      }),
    );
  }

  async findIdentityByLogin(loginRaw: string) {
    const login = loginRaw.trim().toLowerCase();
    const phone = normalizeRuMobilePhone(loginRaw);
    const or: Record<string, string>[] = [{ login }, { email: login }];
    if (phone) or.push({ phone });
    return this.refreshUserSecurity(
      await this.identities.findOne({ $or: or, isDummy: { $ne: true } }),
    );
  }

  async verifyUserPassword(user: UserDocument, password: string) {
    if (!user?.password) {
      await bcrypt.hash(password, 8);
      return false;
    }
    return bcrypt.compare(password, user.password);
  }

  async dummyPasswordWork(password: string) {
    await bcrypt.hash(password || 'x', 8);
  }

  usableForAuth(status: string): boolean {
    return status === 'active' || status === 'invited';
  }

  async ensureFromUser(user: UserDocument): Promise<MstyleIdentityDocument> {
    // Reload credentials explicitly: callers may hold a document without the password field.
    const current = await this.users
      .findById(user._id)
      .select('+password')
      .session(null);
    if (!current) problem(401, 'INVALID_CREDENTIALS');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.inTransaction(() =>
          this.importUser(current, new Set()),
        );
      } catch (error) {
        if ((error as any)?.code !== 11000) throw error;
        if (attempt === 2)
          problem(409, 'CONFLICT', {
            title: 'User identity link conflicts with an existing identity',
          });
      }
    }
    problem(409, 'CONFLICT');
  }

  private async inTransaction<T>(run: () => Promise<T>): Promise<T> {
    this.identities.db.base.set('transactionAsyncLocalStorage', true);
    if (
      (this.identities.db.base as any).transactionAsyncLocalStorage?.getStore()
        ?.session
    )
      return run();
    return this.identities.db.transaction(run, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  }

  private async findLinkedIdentity(user: UserDocument) {
    const userId = String(user._id);
    const matches = await this.identities.find({
      $or: [
        { userId },
        ...(user.passSubject ? [{ subject: user.passSubject }] : []),
      ],
    });
    if (
      matches.length > 1 ||
      (matches[0]?.userId && matches[0].userId !== userId)
    )
      problem(409, 'CONFLICT', { title: 'User identity link is ambiguous' });
    return matches[0] || null;
  }

  private userSecurity(user: UserDocument | null) {
    const status = user ? deriveIdentityStatus(user) : 'deleted';
    return {
      status,
      stamp: hmacHex(
        this.cfg.piiSecret(),
        JSON.stringify([
          user ? String(user._id) : null,
          status,
          user?.authVersion || 1,
          user?.password || null,
        ]),
      ),
    };
  }

  private async refreshUserSecurity(
    identity: MstyleIdentityDocument | null,
  ): Promise<MstyleIdentityDocument | null> {
    if (!identity?.userId) return identity;
    // The auth connection has a separate MongoClient; never attach the integration transaction session.
    const user = await this.users
      .findById(identity.userId)
      .select('+password')
      .session(null);
    const security = this.userSecurity(user);
    if (identity.userSecurityStamp === security.stamp) return identity;
    return this.inTransaction(async () => {
      const current = await this.identities.findOne({
        subject: identity.subject,
      });
      const security = this.userSecurity(
        await this.users
          .findById(identity.userId)
          .select('+password')
          .session(null),
      );
      if (!current || current.userSecurityStamp === security.stamp)
        return current;
      let previous = current.userRestrictionPreviousStatus || null;
      if (!this.usableForAuth(security.status)) {
        if (!previous && this.usableForAuth(current.identityStatus))
          previous = current.identityStatus;
        if (current.identityStatus !== 'deleted')
          current.identityStatus = security.status;
      } else if (
        previous &&
        current.identityStatus === current.userSecurityStatus
      ) {
        current.identityStatus = previous;
        previous = null;
      }
      current.userSecurityStamp = security.stamp;
      current.userSecurityStatus = security.status;
      current.userRestrictionPreviousStatus = previous;
      current.authVersion += 1;
      current.revision += 1;
      current.contextRevision += 1;
      await current.save();
      await this.events.emit({
        type: 'identity.updated',
        aggregate: {
          type: 'identity',
          id: current.subject,
          revision: current.revision,
        },
        subject: current.subject,
      });
      return current;
    });
  }

  private async importUser(
    user: UserDocument,
    ancestors: Set<string>,
  ): Promise<MstyleIdentityDocument> {
    const userId = String(user._id);
    if (ancestors.has(userId))
      problem(409, 'CONFLICT', { title: 'Cyclic native account ownership' });
    ancestors.add(userId);
    const existing = await this.findLinkedIdentity(user);
    if (existing) {
      if (!existing.userId) {
        existing.userId = userId;
        await existing.save();
      }
      await this.syncIdentityProjectionFromUser(user, existing);
      const refreshed = (await this.refreshUserSecurity(existing))!;
      await this.syncProfileOfficeIds(user, refreshed);
      return refreshed;
    }

    const phone = normalizeRuMobilePhone(user.phone || '') || undefined;
    const email = normalizeEmail(user.email || '') || undefined;
    const identifiers = [
      email ? { email } : null,
      phone ? { phone } : null,
      user.username ? { login: user.username.trim().toLowerCase() } : null,
    ].filter((value) => value !== null);
    if (
      identifiers.length &&
      (await this.identities.exists({ $or: identifiers }))
    )
      problem(409, 'CONFLICT', {
        title:
          'Native account identifiers already belong to another identity; explicit link resolution is required',
      });
    const security = this.userSecurity(user);

    const subject = user.passSubject || Ids.subject();
    const identity = await this.identities.create({
      subject,
      userId,
      identityStatus: deriveIdentityStatus(user),
      authVersion: user.authVersion || 1,
      userSecurityStamp: security.stamp,
      userSecurityStatus: security.status,
      userRestrictionPreviousStatus: this.usableForAuth(security.status)
        ? null
        : 'active',
      revision: 1,
      contextRevision: 1,
      displayName:
        user.fullName ||
        [user.lastName, user.firstName, user.middleName]
          .filter(Boolean)
          .join(' '),
      name: {
        lastName: user.lastName ?? null,
        firstName: user.firstName ?? null,
        middleName: user.middleName ?? null,
      },
      birthDate: user.birthDate?.trim() || undefined,
      login: user.username || undefined,
      phone,
      email,
      isDummy: false,
    });

    const ownerUserId = user.parentTenantId
      ? String(user.parentTenantId)
      : userId;
    let ownerIdentity: MstyleIdentityDocument = identity;
    if (ownerUserId !== userId) {
      const ownerUser = await this.users
        .findById(ownerUserId)
        .select('+password')
        .session(null);
      if (!ownerUser)
        problem(409, 'CONFLICT', { title: 'Native account owner is missing' });
      ownerIdentity = await this.importUser(ownerUser, ancestors);
    }

    const ownerMembership = await this.memberships.findOne({
      subject: ownerIdentity.subject,
      role: 'owner',
    });
    let profile = ownerMembership
      ? await this.profiles.findOne({ profileId: ownerMembership.profileId })
      : null;

    if (!profile) {
      if (identity.subject !== ownerIdentity.subject)
        problem(409, 'CONFLICT', {
          title: 'Native owner has no current integration owner profile',
        });
      const profileType = defaultProfileType(user);
      const company =
        user.companyShortName ||
        user.company ||
        ownerIdentity.displayName ||
        'Профиль';
      profile = await this.profiles.create({
        profileId: Ids.profile(),
        type: profileType,
        legalForm: normalizeLegalForm(profileType, user.legalForm),
        status: 'active',
        label: company,
        companyShortName: user.companyShortName || user.company || null,
        companyName: user.company?.trim() || null,
        revision: 1,
        privateDataRevision: null,
        privateDataComplete: false,
        memberPolicy: {
          employeeLimit: user.employeeLimit ?? null,
          residentHoursMonthlyQuotaMin: 0,
          residentHoursMonthlyResetDay: 1,
        },
        officeIds: await this.officeExternalIds(ownerUserId),
        sourceLinks: [],
      });
      await this.memberships.create({
        membershipId: Ids.membership(),
        subject: ownerIdentity.subject,
        profileId: profile.profileId,
        role: 'owner',
        status: 'active',
        validFrom: nowIso(),
        validUntil: null,
        revision: 1,
      });
    }

    if (identity.subject !== ownerIdentity.subject) {
      const exists = await this.memberships.findOne({
        subject: identity.subject,
        profileId: profile.profileId,
      });
      if (!exists) {
        await this.memberships.create({
          membershipId: Ids.membership(),
          subject: identity.subject,
          profileId: profile.profileId,
          role: 'employee',
          status:
            identity.identityStatus === 'disabled' ? 'suspended' : 'active',
          validFrom: nowIso(),
          validUntil: null,
          revision: 1,
        });
      }
    }

    await this.syncContact(identity.subject, 'phone', identity.phone, false);
    await this.syncContact(
      identity.subject,
      'email',
      identity.email,
      !!user.emailVerified,
    );
    return identity;
  }

  private async officeExternalIds(ownerUserId: string): Promise<string[]> {
    const offices = await this.offices
      .find({
        ...officeAssignedToQuery(ownerUserId),
        isActive: true,
        externalId: { $type: 'string', $ne: '' },
      })
      .select('externalId')
      .lean();
    return normalizeOfficeExternalIds(offices);
  }

  private async syncIdentityProjectionFromUser(
    user: UserDocument,
    identity: MstyleIdentityDocument,
  ): Promise<void> {
    const nextName = {
      lastName: user.lastName ?? null,
      firstName: user.firstName ?? null,
      middleName: user.middleName ?? null,
    };
    const nextBirthDate = user.birthDate?.trim() || undefined;
    const nextDisplayName =
      user.displayName?.trim() ||
      user.fullName?.trim() ||
      [user.lastName, user.firstName, user.middleName]
        .filter(Boolean)
        .join(' ');
    const nextLogin = user.username?.trim().toLowerCase() || undefined;
    const nextPhone = normalizeRuMobilePhone(user.phone || '') || undefined;
    const nextEmail = normalizeEmail(user.email || '') || undefined;
    const currentName = {
      lastName: identity.name?.lastName ?? null,
      firstName: identity.name?.firstName ?? null,
      middleName: identity.name?.middleName ?? null,
    };
    const changed =
      JSON.stringify(currentName) !== JSON.stringify(nextName) ||
      (identity.birthDate || undefined) !== nextBirthDate ||
      identity.displayName !== nextDisplayName ||
      (identity.login || undefined) !== nextLogin ||
      (identity.phone || undefined) !== nextPhone ||
      (identity.email || undefined) !== nextEmail;

    if (changed) {
      identity.name = nextName;
      identity.birthDate = nextBirthDate;
      identity.displayName = nextDisplayName;
      identity.login = nextLogin;
      identity.phone = nextPhone;
      identity.email = nextEmail;
      identity.revision += 1;
      identity.contextRevision += 1;
      await identity.save();
      await this.events.emit({
        type: 'identity.updated',
        aggregate: {
          type: 'identity',
          id: identity.subject,
          revision: identity.revision,
        },
        subject: identity.subject,
      });
    }
    await this.syncContact(identity.subject, 'phone', nextPhone, false);
    await this.syncContact(
      identity.subject,
      'email',
      nextEmail,
      !!user.emailVerified,
    );
  }

  async syncNativePersonFromIdentityPatch(
    identity: MstyleIdentityDocument,
    patch: {
      displayName?: string;
      name?: {
        lastName?: string | null;
        firstName?: string | null;
        middleName?: string | null;
      };
      birthDate?: string | null;
    },
  ): Promise<void> {
    if (!identity.userId) return;
    const user = await this.users.findById(identity.userId);
    if (!user) return;
    if (patch.name) {
      const lastName = patch.name.lastName ?? user.lastName ?? '';
      const firstName = patch.name.firstName ?? user.firstName ?? '';
      const middleName =
        patch.name.middleName !== undefined
          ? (patch.name.middleName ?? '')
          : (user.middleName ?? '');
      user.lastName = lastName || undefined;
      user.firstName = firstName || undefined;
      user.middleName = middleName || undefined;
      user.fullName = [lastName, firstName, middleName]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
    }
    if (patch.birthDate !== undefined) {
      const value = patch.birthDate?.trim() || '';
      if (value) user.birthDate = value;
      else user.set('birthDate', undefined);
    }
    if (patch.displayName !== undefined) {
      user.displayName = patch.displayName.trim() || user.fullName;
    }
    await user.save();
  }

  async updateNativeCompanyForProfile(
    profileId: string,
    companyName: string | null,
  ): Promise<void> {
    const membership = await this.memberships.findOne({
      profileId,
      role: 'owner',
      status: { $ne: 'revoked' },
    });
    if (!membership) return;
    const identity = await this.identities.findOne({
      subject: membership.subject,
    });
    if (!identity?.userId) return;
    const user = await this.users.findById(identity.userId);
    if (!user) return;
    const value = companyName?.trim() || '';
    if (value) user.company = value;
    else user.set('company', undefined);
    await user.save();
  }

  private async syncProfileOfficeIds(
    user: UserDocument,
    identity: MstyleIdentityDocument,
  ): Promise<void> {
    const membership = await this.memberships.findOne({
      subject: identity.subject,
      status: 'active',
    });
    if (!membership) return;
    const profile = await this.profiles.findOne({
      profileId: membership.profileId,
    });
    if (!profile) return;

    const ownerUserId = user.parentTenantId
      ? String(user.parentTenantId)
      : String(user._id);
    const officeIds = await this.officeExternalIds(ownerUserId);
    const current = profile.officeIds || [];
    const officeIdsChanged =
      current.length !== officeIds.length ||
      !current.every((id, index) => id === officeIds[index]);
    const nextCompanyName = user.parentTenantId
      ? (profile.companyName ?? null)
      : user.company?.trim() || null;
    const companyNameChanged =
      (profile.companyName ?? null) !== nextCompanyName;
    if (!officeIdsChanged && !companyNameChanged) return;

    const changedFieldCodes: string[] = [];
    if (officeIdsChanged) {
      profile.officeIds = officeIds;
      changedFieldCodes.push('officeIds');
    }
    if (companyNameChanged) {
      profile.companyName = nextCompanyName;
      changedFieldCodes.push('companyName');
    }
    profile.revision += 1;
    await profile.save();
    const members = await this.memberships
      .find({ profileId: profile.profileId, status: 'active' })
      .select('subject')
      .lean();
    for (const member of members) await this.bumpContext(member.subject);
    await this.events.emit({
      type: 'profile.updated',
      aggregate: {
        type: 'resident_profile',
        id: profile.profileId,
        revision: profile.revision,
      },
      profileId: profile.profileId,
      payload: { changedFieldCodes },
    });
    if (officeIdsChanged && this.profileResourceRole(profile) === 'primary') {
      await this.propagateResourceProjectionChange(profile.profileId, [
        'officeIds',
      ]);
    }
  }

  private profileResourceRole(
    profile: MstyleProfile | MstyleProfileDocument,
  ): 'standalone' | 'primary' | 'secondary' {
    const ownerId = String(profile.resourceOwnerProfileId || '').trim();
    if (!ownerId) return 'standalone';
    return ownerId === profile.profileId ? 'primary' : 'secondary';
  }

  private async resolveResourceOwnerProfile(
    profile: MstyleProfileDocument,
  ): Promise<MstyleProfileDocument> {
    const role = this.profileResourceRole(profile);
    if (role !== 'secondary') return profile;
    const owner = await this.profiles.findOne({
      profileId: profile.resourceOwnerProfileId,
    });
    if (!owner) {
      problem(409, 'CONFLICT', {
        title: 'Mstyle resource owner profile is missing',
      });
    }
    if (this.profileResourceRole(owner) !== 'primary') {
      problem(409, 'CONFLICT', {
        title: 'Mstyle resource owner must be a primary profile',
      });
    }
    return owner;
  }

  private async ownerUserIdForProfile(
    profileId: string,
  ): Promise<string | null> {
    const membership = await this.memberships.findOne({
      profileId,
      role: 'owner',
      status: 'active',
    });
    if (!membership) return null;
    const identity = await this.identities.findOne({
      subject: membership.subject,
    });
    return identity?.userId ? String(identity.userId) : null;
  }

  private async secondaryUserIdsForProfile(
    profileId: string,
  ): Promise<string[]> {
    const children = await this.profiles
      .find({
        resourceOwnerProfileId: profileId,
        profileId: { $ne: profileId },
      })
      .select('profileId')
      .lean();
    if (!children.length) return [];
    const profileIds = children.map((child) => child.profileId);
    const memberships = await this.memberships
      .find({
        profileId: { $in: profileIds },
        role: 'owner',
        status: 'active',
      })
      .select('profileId subject')
      .lean();
    const subjects = memberships.map((membership) => membership.subject);
    const identities = subjects.length
      ? await this.identities
          .find({ subject: { $in: subjects } })
          .select('subject userId')
          .lean()
      : [];
    const userBySubject = new Map(
      identities
        .filter((identity) => !!identity.userId)
        .map((identity) => [identity.subject, String(identity.userId)]),
    );
    return memberships
      .map((membership) => userBySubject.get(membership.subject))
      .filter((userId): userId is string => !!userId);
  }

  private async tenantOwnerProfileForUserId(
    userId: string,
  ): Promise<MstyleProfileDocument> {
    const user = await this.users.findById(userId);
    if (!user || user.role !== 'tenant' || user.parentTenantId) {
      problem(409, 'CONFLICT', {
        title: 'Secondary profile must belong to a tenant owner',
      });
    }
    const identity = await this.ensureFromUser(user);
    const profile = await this.adminProfileForIdentity(identity);
    if (!profile) {
      problem(409, 'CONFLICT', {
        title: 'Secondary Mstyle profile is missing',
      });
    }
    return profile;
  }

  private async touchProfileProjection(
    profile: MstyleProfileDocument,
    changedFieldCodes: string[],
  ): Promise<void> {
    profile.revision += 1;
    await profile.save();
    const members = await this.memberships
      .find({ profileId: profile.profileId, status: 'active' })
      .select('subject')
      .lean();
    for (const member of members) await this.bumpContext(member.subject);
    await this.events.emit({
      type: 'profile.updated',
      aggregate: {
        type: 'resident_profile',
        id: profile.profileId,
        revision: profile.revision,
      },
      profileId: profile.profileId,
      payload: { changedFieldCodes },
    });
  }

  private async propagateResourceProjectionChange(
    resourceProfileId: string,
    changedFieldCodes: string[],
  ): Promise<void> {
    if (!changedFieldCodes.length) return;
    const children = await this.profiles.find({
      resourceOwnerProfileId: resourceProfileId,
      profileId: { $ne: resourceProfileId },
    });
    for (const child of children) {
      await this.touchProfileProjection(child, changedFieldCodes);
    }
  }

  private async updateResourceRelations(
    profile: MstyleProfileDocument,
    patch: {
      isPrimaryProfile?: boolean;
      secondaryUserIds?: string[];
    },
  ): Promise<void> {
    const relationTouched =
      patch.isPrimaryProfile !== undefined ||
      patch.secondaryUserIds !== undefined;
    if (!relationTouched) return;

    const currentRole = this.profileResourceRole(profile);
    if (currentRole === 'secondary') {
      problem(409, 'CONFLICT', {
        title: 'Detach the secondary profile from its primary profile first',
      });
    }

    const currentChildren = await this.profiles.find({
      resourceOwnerProfileId: profile.profileId,
      profileId: { $ne: profile.profileId },
    });

    if (
      currentRole === 'primary' &&
      patch.isPrimaryProfile === false &&
      currentChildren.length > 0
    ) {
      problem(409, 'CONFLICT', {
        title:
          'Detach all secondary profiles before disabling the primary profile',
      });
    }

    const desiredPrimary =
      patch.isPrimaryProfile === undefined
        ? currentRole === 'primary'
        : patch.isPrimaryProfile;

    let desiredChildren: MstyleProfileDocument[] = currentChildren;
    if (patch.secondaryUserIds !== undefined) {
      const uniqueUserIds = [...new Set(patch.secondaryUserIds)];
      desiredChildren = [];
      for (const userId of uniqueUserIds) {
        const child = await this.tenantOwnerProfileForUserId(userId);
        if (child.profileId === profile.profileId) {
          problem(409, 'CONFLICT', {
            title: 'A profile cannot be secondary to itself',
          });
        }
        const childRole = this.profileResourceRole(child);
        if (childRole === 'primary') {
          problem(409, 'CONFLICT', {
            title: 'A primary profile cannot be attached as secondary',
          });
        }
        if (
          childRole === 'secondary' &&
          child.resourceOwnerProfileId !== profile.profileId
        ) {
          problem(409, 'CONFLICT', {
            title: 'Secondary profile is already linked to another primary',
          });
        }
        const hasChildren = await this.profiles.exists({
          resourceOwnerProfileId: child.profileId,
          profileId: { $ne: child.profileId },
        });
        if (hasChildren) {
          problem(409, 'CONFLICT', {
            title: 'A profile with secondary profiles cannot become secondary',
          });
        }
        desiredChildren.push(child);
      }
    }

    if (!desiredPrimary && desiredChildren.length) {
      problem(409, 'CONFLICT', {
        title:
          'Primary profile cannot be disabled while secondary profiles are linked',
      });
    }

    const projectionFields = [
      'resourceOwnerProfileId',
      'officeIds',
      'memberPolicy.residentHoursMonthlyQuotaMin',
      'memberPolicy.residentHoursMonthlyResetDay',
    ];

    if (
      desiredPrimary &&
      String(profile.resourceOwnerProfileId || '') !== profile.profileId
    ) {
      profile.resourceOwnerProfileId = profile.profileId;
      await this.touchProfileProjection(profile, ['resourceOwnerProfileId']);
    }

    const desiredIds = new Set(desiredChildren.map((child) => child.profileId));
    for (const child of currentChildren) {
      if (desiredIds.has(child.profileId)) continue;
      child.resourceOwnerProfileId = null;
      await this.touchProfileProjection(child, projectionFields);
    }

    const currentIds = new Set(currentChildren.map((child) => child.profileId));
    for (const child of desiredChildren) {
      if (currentIds.has(child.profileId)) continue;
      child.resourceOwnerProfileId = profile.profileId;
      await this.touchProfileProjection(child, projectionFields);
    }

    if (
      !desiredPrimary &&
      String(profile.resourceOwnerProfileId || '') === profile.profileId
    ) {
      profile.resourceOwnerProfileId = null;
      await this.touchProfileProjection(profile, ['resourceOwnerProfileId']);
    }
  }

  private async adminProfileForIdentity(identity: MstyleIdentityDocument) {
    const membership = await this.memberships
      .findOne({
        subject: identity.subject,
        role: 'owner',
        status: { $ne: 'revoked' },
      })
      .sort({ updatedAt: -1 });
    if (!membership) return null;
    return this.profiles.findOne({ profileId: membership.profileId });
  }

  async getAdminProfileState(
    user: UserDocument,
  ): Promise<MstyleAdminProfileState> {
    const identity = await this.findLinkedIdentity(user);
    if (!identity) {
      return {
        exists: false,
        profileId: null,
        status: null,
        residentHoursMonthlyQuotaMin: 0,
        residentHoursMonthlyResetDay: 1,
        resourceRole: 'standalone',
        resourceOwnerProfileId: null,
        resourceOwnerUserId: null,
        secondaryUserIds: [],
      };
    }
    const profile = await this.adminProfileForIdentity(identity);
    if (!profile) {
      return {
        exists: false,
        profileId: null,
        status: null,
        residentHoursMonthlyQuotaMin: 0,
        residentHoursMonthlyResetDay: 1,
        resourceRole: 'standalone',
        resourceOwnerProfileId: null,
        resourceOwnerUserId: null,
        secondaryUserIds: [],
      };
    }

    const resourceRole = this.profileResourceRole(profile);
    const resourceOwner = await this.resolveResourceOwnerProfile(profile);
    return {
      exists: true,
      profileId: profile.profileId,
      status: profile.status as MstyleAdminProfileState['status'],
      residentHoursMonthlyQuotaMin: Math.max(
        0,
        resourceOwner.memberPolicy?.residentHoursMonthlyQuotaMin ?? 0,
      ),
      residentHoursMonthlyResetDay: Math.min(
        31,
        Math.max(
          1,
          Math.trunc(
            resourceOwner.memberPolicy?.residentHoursMonthlyResetDay ?? 1,
          ),
        ),
      ),
      resourceRole,
      resourceOwnerProfileId:
        resourceRole === 'standalone'
          ? null
          : String(profile.resourceOwnerProfileId),
      resourceOwnerUserId:
        resourceRole === 'secondary'
          ? await this.ownerUserIdForProfile(resourceOwner.profileId)
          : null,
      secondaryUserIds:
        resourceRole === 'primary'
          ? await this.secondaryUserIdsForProfile(profile.profileId)
          : [],
    };
  }

  async updateAdminProfileState(
    user: UserDocument,
    patch: {
      residentHoursMonthlyQuotaMin?: number;
      residentHoursMonthlyResetDay?: number;
      status?: 'active' | 'suspended' | 'closed';
      isPrimaryProfile?: boolean;
      secondaryUserIds?: string[];
    },
  ): Promise<MstyleAdminProfileState> {
    const identity = await this.ensureFromUser(user);
    const profile = await this.adminProfileForIdentity(identity);
    if (!profile) {
      problem(409, 'CONFLICT', {
        title: 'Mstyle owner profile is missing',
      });
    }

    await this.updateResourceRelations(profile, patch);

    const resourceRole = this.profileResourceRole(profile);
    const resourceOwner = await this.resolveResourceOwnerProfile(profile);
    const changedFieldCodes: string[] = [];
    const resourceChangedFieldCodes: string[] = [];

    const nextQuota =
      patch.residentHoursMonthlyQuotaMin === undefined
        ? undefined
        : Math.max(0, Math.trunc(patch.residentHoursMonthlyQuotaMin));
    const nextResetDay =
      patch.residentHoursMonthlyResetDay === undefined
        ? undefined
        : Math.min(
            31,
            Math.max(1, Math.trunc(patch.residentHoursMonthlyResetDay)),
          );

    if (resourceRole === 'secondary') {
      const currentQuota = Math.max(
        0,
        resourceOwner.memberPolicy?.residentHoursMonthlyQuotaMin ?? 0,
      );
      const currentResetDay = Math.min(
        31,
        Math.max(
          1,
          Math.trunc(
            resourceOwner.memberPolicy?.residentHoursMonthlyResetDay ?? 1,
          ),
        ),
      );
      if (
        (nextQuota !== undefined && nextQuota !== currentQuota) ||
        (nextResetDay !== undefined && nextResetDay !== currentResetDay)
      ) {
        problem(409, 'CONFLICT', {
          title: 'Resident-hours policy is inherited from the primary profile',
        });
      }
    } else {
      if (
        nextQuota !== undefined &&
        nextQuota !==
          Math.max(0, profile.memberPolicy?.residentHoursMonthlyQuotaMin ?? 0)
      ) {
        profile.memberPolicy = {
          ...(profile.memberPolicy || { employeeLimit: null }),
          residentHoursMonthlyQuotaMin: nextQuota,
        };
        changedFieldCodes.push('memberPolicy.residentHoursMonthlyQuotaMin');
        resourceChangedFieldCodes.push(
          'memberPolicy.residentHoursMonthlyQuotaMin',
        );
      }

      if (
        nextResetDay !== undefined &&
        nextResetDay !==
          Math.min(
            31,
            Math.max(
              1,
              Math.trunc(
                profile.memberPolicy?.residentHoursMonthlyResetDay ?? 1,
              ),
            ),
          )
      ) {
        profile.memberPolicy = {
          ...(profile.memberPolicy || { employeeLimit: null }),
          residentHoursMonthlyResetDay: nextResetDay,
        };
        changedFieldCodes.push('memberPolicy.residentHoursMonthlyResetDay');
        resourceChangedFieldCodes.push(
          'memberPolicy.residentHoursMonthlyResetDay',
        );
      }
    }

    const statusChanged =
      patch.status !== undefined && patch.status !== profile.status;
    if (statusChanged) {
      const allowed: Record<string, readonly string[]> = {
        draft: ['active', 'closed'],
        active: ['suspended', 'closed'],
        suspended: ['active', 'closed'],
      };
      if (!allowed[profile.status]?.includes(patch.status!)) {
        problem(409, 'CONFLICT', {
          title: 'Invalid profile lifecycle transition',
        });
      }
      if (patch.status === 'active') {
        const owner = await this.memberships.findOne({
          profileId: profile.profileId,
          role: 'owner',
          status: 'active',
        });
        if (!owner || !profile.privateDataComplete) {
          problem(409, 'CONFLICT', {
            title: 'Profile is not ready for activation',
          });
        }
      }
      profile.status = patch.status!;
      changedFieldCodes.push('status');
    }

    if (changedFieldCodes.length) {
      profile.revision += 1;
      await profile.save();
      const members = await this.memberships
        .find({ profileId: profile.profileId, status: 'active' })
        .select('subject')
        .lean();
      for (const member of members) await this.bumpContext(member.subject);
      await this.events.emit({
        type: 'profile.updated',
        aggregate: {
          type: 'resident_profile',
          id: profile.profileId,
          revision: profile.revision,
        },
        profileId: profile.profileId,
        payload: {
          changedFieldCodes,
          ...(statusChanged
            ? { status: profile.status, reasonCode: 'pass_admin_interface' }
            : {}),
        },
      });
      if (resourceChangedFieldCodes.length) {
        await this.propagateResourceProjectionChange(
          profile.profileId,
          resourceChangedFieldCodes,
        );
      }
    }

    return this.getAdminProfileState(user);
  }

  async ensureStandalone(input: {
    identifierType: 'phone' | 'email';
    identifierValue: string;
    displayName?: string;
    name?: {
      lastName?: string | null;
      firstName?: string | null;
      middleName?: string | null;
    };
    status?: string;
  }): Promise<MstyleIdentityDocument> {
    const existing = await this.findIdentityByIdentifier(
      input.identifierType,
      input.identifierValue,
    );
    if (existing) return existing;
    const native = await this.findUserByIdentifier(
      input.identifierType,
      input.identifierValue,
    );
    if (native && !(await this.findLinkedIdentity(native)))
      problem(409, 'CONFLICT', {
        title:
          'Native account must first sign in to establish its identity link',
      });
    const phone =
      input.identifierType === 'phone'
        ? normalizeRuMobilePhone(input.identifierValue)
        : undefined;
    const email =
      input.identifierType === 'email'
        ? normalizeEmail(input.identifierValue)
        : undefined;
    return this.identities.create({
      subject: Ids.subject(),
      identityStatus: input.status || 'invited',
      authVersion: 1,
      revision: 1,
      contextRevision: 1,
      displayName: input.displayName || '',
      name: {
        lastName: input.name?.lastName ?? null,
        firstName: input.name?.firstName ?? null,
        middleName: input.name?.middleName ?? null,
      },
      phone: phone || undefined,
      email: email || undefined,
      isDummy: false,
    });
  }

  async syncContact(
    subject: string,
    type: 'phone' | 'email',
    value?: string | null,
    verified = true,
  ) {
    if (!value) return null;
    const normalized =
      type === 'phone' ? normalizeRuMobilePhone(value) : normalizeEmail(value);
    if (!normalized) return null;
    const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${normalized}`);
    const existing = await this.contacts.findOne({ subject, type, valueHash });
    if (existing) {
      if (verified && !existing.verifiedAt) {
        existing.verifiedAt = nowIso();
        existing.revision += 1;
        await existing.save();
      }
      return existing;
    }
    return this.contacts.create({
      contactId: Ids.contact(),
      subject,
      type,
      masked: maskContact(type, normalized),
      valueEnc: encryptJson(this.cfg.piiSecret(), normalized),
      valueHash,
      verifiedAt: verified ? nowIso() : null,
      revision: 1,
    });
  }

  async confirmLogin(
    subject: string,
    identifierType: string,
    identifierHash: string,
  ) {
    this.identities.db.base.set('transactionAsyncLocalStorage', true);
    const run = async () => {
      const identity = await this.findIdentityBySubject(subject);
      if (!identity || !this.usableForAuth(identity.identityStatus))
        problem(401, 'INVALID_CREDENTIALS');
      const type = identifierType as 'email' | 'phone';
      const value = type === 'email' ? identity.email : identity.phone;
      if (
        !value ||
        !['email', 'phone'].includes(type) ||
        hmacHex(this.cfg.rateLimitSecret(), type + ':' + value) !==
          identifierHash
      )
        problem(401, 'INVALID_CREDENTIALS');
      const contact = await this.syncContact(subject, type, value);
      const invitations = await this.memberships.find({
        subject,
        role: 'employee',
        status: 'invited',
      });
      for (const membership of invitations) {
        const conflict = await this.memberships.findOne({
          subject,
          status: 'active',
          $or: [
            { role: 'owner' },
            { profileId: { $ne: membership.profileId }, role: 'employee' },
          ],
        });
        if (conflict)
          problem(409, 'CONFLICT', {
            title: 'Identity already belongs to another profile',
          });
        const profile = await this.profiles.findOne({
          profileId: membership.profileId,
        });
        if (!profile || profile.status !== 'active')
          problem(409, 'CONFLICT', { title: 'Profile is not active' });
        const limit = profile.memberPolicy?.employeeLimit;
        if (
          limit != null &&
          (await this.memberships.countDocuments({
            profileId: profile.profileId,
            role: 'employee',
            status: { $in: [...EMPLOYEE_SLOT_STATUSES] },
            membershipId: { $ne: membership.membershipId },
          })) >= limit
        )
          problem(409, 'MEMBERSHIP_LIMIT_EXCEEDED', {
            title: 'Employee limit reached',
          });
        membership.status = 'active';
        membership.revision += 1;
        await membership.save();
        profile.membershipSetRevision += 1;
        await profile.save();
        const others = await this.memberships.find({
          profileId: profile.profileId,
          status: 'active',
          subject: { $ne: subject },
        });
        for (const other of others) await this.bumpContext(other.subject);
        await this.events.emit({
          type: 'resident_membership.updated',
          aggregate: {
            type: 'resident_membership',
            id: membership.membershipId,
            revision: membership.revision,
          },
          subject,
          profileId: profile.profileId,
        });
      }
      if (identity.identityStatus === 'invited') {
        identity.identityStatus = 'active';
      }
      identity.revision += 1;
      identity.contextRevision += 1;
      await identity.save();
      if (contact)
        await this.events.emit({
          type: 'identity.updated',
          aggregate: {
            type: 'identity',
            id: subject,
            revision: identity.revision,
          },
          subject,
        });
    };
    if (
      (this.identities.db.base as any).transactionAsyncLocalStorage?.getStore()
        ?.session
    )
      await run();
    else
      await this.identities.db.transaction(run, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
  }

  async bumpContext(subject: string) {
    await this.identities.updateOne(
      { subject },
      { $inc: { contextRevision: 1 } },
    );
  }

  async bumpAuthVersion(subject: string) {
    await this.identities.updateOne(
      { subject },
      { $inc: { authVersion: 1, contextRevision: 1 } },
    );
  }
}
