import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { AUTH_CONNECTION } from '../../database/auth-database.constants';
import { User, UserDocument } from '../../schemas';
import { encryptJson } from './mstyle-v2.crypto';
import { MstyleV2Config } from './mstyle-v2.config';
import { MstyleIdentityService } from './mstyle-v2.identities';
import { Ids } from './mstyle-v2.ids';
import {
  MANUAL_TEST_PROFILES,
  ManualTestIdentityFixture,
  ManualTestProfileFixture,
} from './mstyle-v2.manual-test-profiles';
import { validateResidentValues } from './mstyle-v2.private-values';
import {
  MstyleMembership,
  MstyleMembershipDocument,
  MstyleContactAssignment,
  MstyleContactAssignmentDocument,
  MstyleAccessGrant,
  MstyleAccessGrantDocument,
  MstylePrivateData,
  MstylePrivateDataDocument,
  MstyleProfile,
  MstyleProfileDocument,
} from './mstyle-v2.schemas';

@Injectable()
export class MstyleManualTestingService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly identities: MstyleIdentityService,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly users: Model<UserDocument>,
    @InjectModel(MstyleProfile.name)
    private readonly profiles: Model<MstyleProfileDocument>,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembershipDocument>,
    @InjectModel(MstylePrivateData.name)
    private readonly privateData: Model<MstylePrivateDataDocument>,
    @InjectModel(MstyleContactAssignment.name)
    private readonly assignments: Model<MstyleContactAssignmentDocument>,
    @InjectModel(MstyleAccessGrant.name)
    private readonly accessGrants: Model<MstyleAccessGrantDocument>,
  ) {}

  async prepare() {
    const prepared: Array<{
      key: string;
      title: string;
      profileId: string;
      subject: string;
      employees: number;
    }> = [];
    const localPrincipals: Array<{
      profileKey: string;
      identityKey: string;
      subject: string;
      role: 'owner' | 'employee';
      balanceMinutes: number;
      accrualOffsetDays: number | null;
      expiresOffsetDays: number | null;
    }> = [];
    const preparedProfileIds: string[] = [];

    for (const fixture of MANUAL_TEST_PROFILES) {
      const owner = await this.upsertUser(fixture.owner, fixture);
      const ownerIdentity = await this.identities.ensureFromUser(owner);
      const membership = await this.memberships.findOne({
        subject: ownerIdentity.subject,
        role: 'owner',
        status: 'active',
      });
      if (!membership) {
        throw new ConflictException(
          `Не удалось подготовить профиль «${fixture.title}»`,
        );
      }
      const profile = await this.profiles.findOne({
        profileId: membership.profileId,
      });
      if (!profile) {
        throw new ConflictException(
          `Не удалось найти профиль «${fixture.title}»`,
        );
      }
      await this.applyProfileFixture(profile, fixture);
      await this.applyAccessFixture(profile, fixture);
      await this.applyPrimaryContactAssignments(
        profile,
        ownerIdentity.subject,
        fixture.owner,
      );
      localPrincipals.push({
        profileKey: fixture.key,
        identityKey: fixture.owner.key,
        subject: ownerIdentity.subject,
        role: 'owner',
        balanceMinutes: fixture.scenario.balanceMinutes,
        accrualOffsetDays: fixture.scenario.accrualOffsetDays,
        expiresOffsetDays: fixture.scenario.expiresOffsetDays,
      });

      for (const employeeFixture of fixture.employees) {
        const employee = await this.upsertUser(
          employeeFixture,
          fixture,
          owner._id,
        );
        const employeeIdentity = await this.identities.ensureFromUser(employee);
        await this.ensureEmployeeMembership(profile, employeeIdentity.subject);
        localPrincipals.push({
          profileKey: fixture.key,
          identityKey: employeeFixture.key,
          subject: employeeIdentity.subject,
          role: 'employee',
          balanceMinutes: fixture.scenario.employeeBalanceMinutes,
          accrualOffsetDays: fixture.scenario.accrualOffsetDays,
          expiresOffsetDays: fixture.scenario.expiresOffsetDays,
        });
      }

      prepared.push({
        key: fixture.key,
        title: fixture.title,
        profileId: profile.profileId,
        subject: ownerIdentity.subject,
        employees: fixture.employees.length,
      });
      preparedProfileIds.push(profile.profileId);
    }

    localPrincipals.push(
      ...(await this.removeCandidateMemberships(preparedProfileIds)),
    );
    return { prepared, localPrincipals };
  }

  private async ensureEmployeeMembership(
    profile: MstyleProfileDocument,
    subject: string,
  ) {
    const existing = await this.memberships.findOne({
      profileId: profile.profileId,
      subject,
    });
    if (!existing) {
      await this.memberships.create({
        membershipId: Ids.membership(),
        subject,
        profileId: profile.profileId,
        role: 'employee',
        status: 'active',
        validFrom: new Date().toISOString(),
        validUntil: null,
        revision: 1,
      });
      profile.membershipSetRevision = (profile.membershipSetRevision || 0) + 1;
      await profile.save();
      await this.identities.bumpContext(subject);
      return;
    }
    if (
      existing.role === 'employee' &&
      existing.status === 'active' &&
      existing.validUntil === null
    ) {
      return;
    }
    existing.role = 'employee';
    existing.status = 'active';
    existing.validUntil = null;
    existing.revision += 1;
    await existing.save();
    profile.membershipSetRevision = (profile.membershipSetRevision || 0) + 1;
    await profile.save();
    await this.identities.bumpContext(subject);
  }

  private async removeCandidateMemberships(profileIds: string[]) {
    const principals: Array<{
      profileKey: string;
      identityKey: string;
      subject: string;
      role: 'employee';
      balanceMinutes: number;
      accrualOffsetDays: null;
      expiresOffsetDays: null;
    }> = [];
    for (const fixture of MANUAL_TEST_PROFILES) {
      for (const candidate of fixture.employeeCandidates) {
        const identity = await this.identities.findIdentityByIdentifier(
          'email',
          candidate.email,
        );
        if (!identity) continue;
        principals.push({
          profileKey: fixture.key,
          identityKey: candidate.key,
          subject: identity.subject,
          role: 'employee',
          balanceMinutes: 0,
          accrualOffsetDays: null,
          expiresOffsetDays: null,
        });
        const memberships = await this.memberships
          .find({ subject: identity.subject, profileId: { $in: profileIds } })
          .lean();
        if (!memberships.length) continue;
        await this.memberships.deleteMany({
          subject: identity.subject,
          profileId: { $in: profileIds },
        });
        await this.profiles.updateMany(
          { profileId: { $in: memberships.map((item) => item.profileId) } },
          { $inc: { membershipSetRevision: 1, revision: 1 } },
        );
        await this.identities.bumpContext(identity.subject);
      }
    }
    return principals;
  }

  private async upsertUser(
    identity: ManualTestIdentityFixture,
    profile: ManualTestProfileFixture,
    parentTenantId?: Types.ObjectId,
  ) {
    const existing = await this.users
      .findOne({
        $or: [{ email: identity.email }, { phone: identity.phone }],
      })
      .select('+password');
    if (existing && existing.meta?.manualTestIdentityKey !== identity.key) {
      throw new ConflictException(
        `Почта ${identity.email} или телефон ${identity.phone} уже заняты обычным аккаунтом`,
      );
    }
    const password =
      existing?.password ||
      (await bcrypt.hash(randomBytes(32).toString('hex'), 10));
    const update = {
      email: identity.email,
      phone: identity.phone,
      fullName: identity.fullName,
      lastName: identity.lastName,
      firstName: identity.firstName,
      middleName: identity.middleName,
      displayName: identity.fullName,
      company: profile.title,
      companyShortName: profile.companyShortName || undefined,
      profileType: profile.type,
      legalForm: profile.legalForm,
      employeeLimit: profile.employeeLimit,
      role: identity.role === 'employee' ? 'tenant_employee' : 'tenant',
      parentTenantId: parentTenantId || null,
      password,
      emailVerified: true,
      privateDataComplete: true,
      isActive: true,
      isBlocked: false,
      invitePending: false,
      identityStatus: 'active',
      meta: {
        ...(existing?.meta || {}),
        manualTestProfileKey: profile.key,
        manualTestIdentityKey: identity.key,
      },
    };
    return this.users.findOneAndUpdate(
      existing ? { _id: existing._id } : { email: identity.email },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  private async applyProfileFixture(
    profile: MstyleProfileDocument,
    fixture: ManualTestProfileFixture,
  ) {
    const values = validateResidentValues(
      structuredClone(fixture.privateData),
      fixture.type,
      fixture.legalForm,
    );
    const storedPrivateData = await this.privateData
      .findOne({ partyType: 'resident_profile', partyId: profile.profileId })
      .select({ revision: 1 })
      .lean();
    const privateDataRevision =
      Math.max(
        profile.privateDataRevision || 0,
        storedPrivateData?.revision || 0,
      ) + 1;
    const wasPrepared = profile.sourceLinks.some(
      (link) =>
        link.environment === 'manual-testing' &&
        link.externalId === `manual-test:${fixture.key}`,
    );
    profile.type = fixture.type;
    profile.legalForm = fixture.legalForm;
    profile.status = 'active';
    profile.label = fixture.title;
    profile.companyShortName = fixture.companyShortName;
    profile.privateDataRevision = privateDataRevision;
    profile.privateDataComplete = true;
    if (wasPrepared) profile.revision += 1;
    profile.memberPolicy = {
      employeeLimit: fixture.employeeLimit,
      residentHoursMonthlyQuotaMin: Math.max(
        0,
        fixture.scenario.balanceMinutes,
      ),
    };
    profile.sourceLinks = [
      {
        sourceSystem: 'mstyle-wordpress',
        environment: 'manual-testing',
        entityType: 'resident',
        externalId: `manual-test:${fixture.key}`,
        linkedAt: new Date().toISOString(),
      },
    ];
    await profile.save();
    await this.privateData.findOneAndUpdate(
      { partyType: 'resident_profile', partyId: profile.profileId },
      {
        $set: {
          profileType: fixture.type,
          legalForm: fixture.legalForm,
          revision: privateDataRevision,
          editPolicy: fixture.editPolicy,
          valuesEnc: encryptJson(this.cfg.piiSecret(), values),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  private async applyAccessFixture(
    profile: MstyleProfileDocument,
    fixture: ManualTestProfileFixture,
  ) {
    const office = fixture.scenario.office;
    const existing = await this.accessGrants.findOne({
      profileId: profile.profileId,
      'resource.id': { $regex: '^off_manual_' },
    });
    await this.accessGrants.deleteMany({
      profileId: profile.profileId,
      ...(existing ? { grantId: { $ne: existing.grantId } } : {}),
    });
    if (!office) {
      if (existing) await existing.deleteOne();
      profile.accessFactsRevision = (profile.accessFactsRevision || 0) + 1;
      await profile.save();
      return;
    }
    const next = {
      profileId: profile.profileId,
      resource: {
        type: 'office',
        id: office.resourceId,
        mstyleLink: {
          sourceSystem: 'mstyle-wordpress' as const,
          environment: 'production',
          entityType: 'room' as const,
          externalId: office.externalId,
        },
      },
      permissions: ['enter', 'exit', 'visitor_invite'],
      status: 'active',
      validFrom: offsetIso(office.validFromOffsetDays, false),
      validUntil: offsetIso(office.validUntilOffsetDays, true),
    };
    if (!existing) {
      await this.accessGrants.create({
        grantId: Ids.grant(),
        ...next,
        revision: 1,
      });
    } else {
      existing.set(next);
      existing.revision += 1;
      await existing.save();
    }
    profile.accessFactsRevision = (profile.accessFactsRevision || 0) + 1;
    await profile.save();
  }

  private async applyPrimaryContactAssignments(
    profile: MstyleProfileDocument,
    subject: string,
    owner: ManualTestIdentityFixture,
  ) {
    const contacts = await Promise.all([
      this.identities.syncContact(subject, 'phone', owner.phone, true),
      this.identities.syncContact(subject, 'email', owner.email, true),
    ]);
    let changed = false;

    for (const contact of contacts) {
      if (!contact) continue;
      const current = await this.assignments.findOne({
        profileId: profile.profileId,
        purpose: 'primary',
        contactType: contact.type,
      });
      const next = {
        profileId: profile.profileId,
        purpose: 'primary',
        subject,
        contactId: contact.contactId,
        contactType: contact.type,
        contactMask: contact.masked,
        contactVerified: true,
        priority: 1,
        status: 'active',
      };
      if (!current) {
        await this.assignments.create({
          assignmentId: Ids.assignment(),
          ...next,
          revision: 1,
        });
        changed = true;
        continue;
      }
      const differs = Object.entries(next).some(
        ([key, value]) => String((current as any)[key] ?? '') !== String(value),
      );
      if (!differs) continue;
      current.set(next);
      current.revision += 1;
      await current.save();
      changed = true;
    }

    if (changed) {
      profile.assignmentSetRevision = (profile.assignmentSetRevision || 0) + 1;
      await profile.save();
      await this.identities.bumpContext(subject);
    }
  }
}

function offsetIso(offsetDays: number, endOfDay: boolean) {
  const date = new Date();
  date.setUTCHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}
