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
import {
  MANUAL_TEST_PROFILES,
  ManualTestIdentityFixture,
  ManualTestProfileFixture,
} from './mstyle-v2.manual-test-profiles';
import { validateResidentValues } from './mstyle-v2.private-values';
import {
  MstyleMembership,
  MstyleMembershipDocument,
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
  ) {}

  async prepare() {
    const prepared: Array<{
      key: string;
      title: string;
      profileId: string;
      subject: string;
      employees: number;
    }> = [];

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

      for (const employeeFixture of fixture.employees) {
        const employee = await this.upsertUser(
          employeeFixture,
          fixture,
          owner._id,
        );
        await this.identities.ensureFromUser(employee);
      }

      prepared.push({
        key: fixture.key,
        title: fixture.title,
        profileId: profile.profileId,
        subject: ownerIdentity.subject,
        employees: fixture.employees.length,
      });
    }

    return { prepared };
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
    profile.memberPolicy = { employeeLimit: fixture.employeeLimit };
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
          editPolicy: 'request_only',
          valuesEnc: encryptJson(this.cfg.piiSecret(), values),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}
