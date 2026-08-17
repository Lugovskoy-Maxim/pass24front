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
    const login = loginRaw.trim().toLowerCase();
    const phone = normalizeRuMobilePhone(loginRaw);
    const or: Record<string, string>[] = [
      { username: login },
      { email: login },
    ];
    if (phone) or.push({ phone });
    return this.users.findOne({ $or: or }).select('+password');
  }

  async findUserByIdentifier(type: 'phone' | 'email', value: string) {
    if (type === 'phone') {
      const phone = normalizeRuMobilePhone(value);
      if (!phone) return null;
      return this.users.findOne({ phone }).select('+password');
    }
    return this.users
      .findOne({ email: normalizeEmail(value) })
      .select('+password');
  }

  async findIdentityBySubject(subject: string) {
    return this.identities.findOne({ subject, isDummy: { $ne: true } });
  }

  async findIdentityByIdentifier(type: 'phone' | 'email', value: string) {
    if (type === 'phone') {
      const phone = normalizeRuMobilePhone(value);
      if (!phone) return null;
      return this.identities.findOne({ phone, isDummy: { $ne: true } });
    }
    return this.identities.findOne({
      email: normalizeEmail(value),
      isDummy: { $ne: true },
    });
  }

  async findIdentityByLogin(loginRaw: string) {
    const login = loginRaw.trim().toLowerCase();
    const phone = normalizeRuMobilePhone(loginRaw);
    const or: Record<string, string>[] = [{ login }, { email: login }];
    if (phone) or.push({ phone });
    return this.identities.findOne({ $or: or, isDummy: { $ne: true } });
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
    const userId = String(user._id);
    const existing = await this.identities.findOne({
      $or: [
        { userId },
        ...(user.passSubject ? [{ subject: user.passSubject }] : []),
      ],
    });
    if (existing) {
      existing.identityStatus = deriveIdentityStatus(user);
      existing.authVersion = user.authVersion || existing.authVersion || 1;
      existing.phone = user.phone || existing.phone;
      existing.email = user.email || existing.email;
      existing.login = user.username || existing.login;
      existing.displayName =
        user.displayName ||
        user.fullName ||
        existing.displayName ||
        [user.lastName, user.firstName].filter(Boolean).join(' ');
      existing.name = {
        lastName: user.lastName ?? existing.name?.lastName ?? null,
        firstName: user.firstName ?? existing.name?.firstName ?? null,
        middleName: user.middleName ?? existing.name?.middleName ?? null,
      };
      await existing.save();
      await this.writeBackUser(user, existing);
      await this.syncProfileFromUser(existing.subject, user);
      return existing;
    }

    const subject = user.passSubject || Ids.subject();
    const identity = await this.identities.create({
      subject,
      userId,
      identityStatus: deriveIdentityStatus(user),
      authVersion: user.authVersion || 1,
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
      phone: user.phone || undefined,
      email: user.email || undefined,
      isDummy: false,
    });

    const ownerUserId = user.parentTenantId
      ? String(user.parentTenantId)
      : userId;
    let ownerIdentity: MstyleIdentityDocument = identity;
    if (ownerUserId !== userId) {
      const ownerUser = await this.users.findById(ownerUserId);
      if (ownerUser) ownerIdentity = await this.ensureFromUser(ownerUser);
    }

    const ownerMembership = await this.memberships.findOne({
      subject: ownerIdentity.subject,
      role: 'owner',
    });
    let profile = ownerMembership
      ? await this.profiles.findOne({ profileId: ownerMembership.profileId })
      : null;

    if (!profile) {
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
        privateDataRevision: user.privateDataRevision ?? null,
        privateDataComplete: !!user.privateDataComplete,
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

    await this.syncContact(identity.subject, 'phone', identity.phone);
    await this.syncContact(identity.subject, 'email', identity.email);
    await this.writeBackUser(user, identity);
    return identity;
  }

  private async writeBackUser(
    user: UserDocument,
    identity: MstyleIdentityDocument,
  ) {
    const patch: Record<string, unknown> = {
      passSubject: identity.subject,
      identityStatus: identity.identityStatus,
      authVersion: identity.authVersion,
      displayName: identity.displayName,
    };
    await this.users.updateOne({ _id: user._id }, { $set: patch });
    user.passSubject = identity.subject;
    user.identityStatus = identity.identityStatus;
    user.authVersion = identity.authVersion;
    user.displayName = identity.displayName;
  }

  private async syncProfileFromUser(ownerSubject: string, user: UserDocument) {
    const membership = await this.memberships.findOne({
      subject: ownerSubject,
      role: 'owner',
    });
    if (!membership) return;
    const profile = await this.profiles.findOne({
      profileId: membership.profileId,
    });
    if (!profile) return;
    const profileType = defaultProfileType(user);
    profile.type = profileType;
    profile.legalForm = normalizeLegalForm(profileType, user.legalForm);
    profile.companyShortName =
      user.companyShortName || user.company || profile.companyShortName;
    profile.label = user.companyShortName || user.company || profile.label;
    profile.memberPolicy = {
      employeeLimit:
        user.employeeLimit ?? profile.memberPolicy?.employeeLimit ?? null,
    };
    if (user.privateDataComplete != null) {
      profile.privateDataComplete = !!user.privateDataComplete;
    }
    if (user.privateDataRevision != null) {
      profile.privateDataRevision = user.privateDataRevision;
    }
    await profile.save();
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
  ) {
    if (!value) return null;
    const normalized =
      type === 'phone' ? normalizeRuMobilePhone(value) : normalizeEmail(value);
    if (!normalized) return null;
    const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${normalized}`);
    const existing = await this.contacts.findOne({ subject, type, valueHash });
    if (existing) return existing;
    return this.contacts.create({
      contactId: Ids.contact(),
      subject,
      type,
      masked: maskContact(type, normalized),
      valueEnc: encryptJson(this.cfg.piiSecret(), normalized),
      valueHash,
      verifiedAt: nowIso(),
      revision: 1,
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
