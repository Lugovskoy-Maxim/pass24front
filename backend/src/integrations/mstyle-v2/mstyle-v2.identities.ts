import { MstyleEventsService } from './mstyle-v2.events';
import { problem } from './mstyle-v2.problem';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AUTH_CONNECTION } from '../../database/auth-database.constants';
import { User, UserDocument } from '../../schemas';
import { normalizeRuMobilePhone } from '../../common/phone';
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

export function identityStatusFromUser(
  user: UserDocument | Record<string, any>,
) {
  return deriveIdentityStatus(user);
}

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
      return (await this.refreshUserSecurity(existing))!;
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
        revision: 1,
        privateDataRevision: null,
        privateDataComplete: false,
        memberPolicy: { employeeLimit: user.employeeLimit ?? null },
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
            status: 'active',
          })) >= limit
        )
          problem(409, 'CONFLICT', { title: 'Employee limit reached' });
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
