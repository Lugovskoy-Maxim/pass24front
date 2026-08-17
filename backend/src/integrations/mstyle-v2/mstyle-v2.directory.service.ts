import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { normalizeRuMobilePhone } from '../../common/phone';
import {
  CHALLENGE_TTL_MS,
  CODE_LENGTH,
  RESEND_MIN_MS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  decryptJson,
  encryptJson,
  hmacHex,
  maskContact,
  normalizeEmail,
} from './mstyle-v2.crypto';
import type {
  ChangeDecisionDto,
  ChangeRequestDto,
  ConsentAcceptDto,
  ContactChallengeDto,
  ContactVerifyDto,
  CreateMembershipDto,
  DeletionRequestDto,
  LifecycleDto,
  OnboardingDto,
  OwnerTransferDto,
  PatchAssignmentsDto,
  PatchIdentityDto,
  PatchMembershipDto,
  PatchProfileDto,
  SearchProfilesDto,
} from './mstyle-v2.dto';
import { MstyleEventsService } from './mstyle-v2.events';
import { Ids } from './mstyle-v2.ids';
import { MstyleIdentityService } from './mstyle-v2.identities';
import {
  assignmentDto,
  consentItem,
  contactDto,
  etag,
  grantDto,
  membershipDto,
  nowIso,
  parseIfMatch,
  safeIdentity,
  safeProfile,
  schema,
} from './mstyle-v2.present';
import { MstyleResult, problem } from './mstyle-v2.problem';
import {
  MstyleAccessGrant,
  MstyleAccessGrantDocument,
  MstyleChallenge,
  MstyleChallengeDocument,
  MstyleChangeRequest,
  MstyleChangeRequestDocument,
  MstyleConsent,
  MstyleConsentDocument,
  MstyleContact,
  MstyleContactAssignment,
  MstyleContactAssignmentDocument,
  MstyleContactDocument,
  MstyleDeletionRequest,
  MstyleDeletionRequestDocument,
  MstyleIdentity,
  MstyleIdentityDocument,
  MstyleMembership,
  MstyleMembershipDocument,
  MstylePrivateData,
  MstylePrivateDataDocument,
  MstyleProfile,
  MstyleProfileDocument,
} from './mstyle-v2.schemas';

@Injectable()
export class MstyleDirectoryService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly identities: MstyleIdentityService,
    private readonly events: MstyleEventsService,
    @InjectModel(MstyleIdentity.name)
    private readonly identityModel: Model<MstyleIdentityDocument>,
    @InjectModel(MstyleProfile.name)
    private readonly profiles: Model<MstyleProfileDocument>,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembershipDocument>,
    @InjectModel(MstyleContact.name)
    private readonly contacts: Model<MstyleContactDocument>,
    @InjectModel(MstyleContactAssignment.name)
    private readonly assignments: Model<MstyleContactAssignmentDocument>,
    @InjectModel(MstyleConsent.name)
    private readonly consents: Model<MstyleConsentDocument>,
    @InjectModel(MstylePrivateData.name)
    private readonly privateData: Model<MstylePrivateDataDocument>,
    @InjectModel(MstyleChallenge.name)
    private readonly challenges: Model<MstyleChallengeDocument>,
    @InjectModel(MstyleAccessGrant.name)
    private readonly grants: Model<MstyleAccessGrantDocument>,
    @InjectModel(MstyleChangeRequest.name)
    private readonly changeRequests: Model<MstyleChangeRequestDocument>,
    @InjectModel(MstyleDeletionRequest.name)
    private readonly deletions: Model<MstyleDeletionRequestDocument>,
  ) {}

  async getContext(subject: string): Promise<MstyleResult> {
    const identity = await this.requireIdentity(subject);
    const memberships = await this.memberships.find({ subject }).lean();
    const profiles: Record<string, unknown>[] = [];
    for (const membership of memberships) {
      const profile = await this.profiles.findOne({
        profileId: membership.profileId,
      });
      if (!profile) continue;
      const phoneAssign = await this.assignments.findOne({
        profileId: profile.profileId,
        contactType: 'phone',
        status: 'active',
      });
      const emailAssign = await this.assignments.findOne({
        profileId: profile.profileId,
        contactType: 'email',
        status: 'active',
      });
      const phoneContact = phoneAssign
        ? await this.contacts.findOne({ contactId: phoneAssign.contactId })
        : null;
      const emailContact = emailAssign
        ? await this.contacts.findOne({ contactId: emailAssign.contactId })
        : null;
      const identityPhone = await this.contacts.findOne({
        subject,
        type: 'phone',
      });
      const identityEmail = await this.contacts.findOne({
        subject,
        type: 'email',
      });
      profiles.push({
        profileId: profile.profileId,
        membershipId: membership.membershipId,
        membershipRole: membership.role,
        membershipStatus: membership.status,
        profileStatus: profile.status,
        profileType: profile.type,
        legalForm: profile.legalForm,
        profileRevision: profile.revision,
        privateDataRevision: profile.privateDataRevision,
        privateDataComplete: profile.privateDataComplete,
        display: { label: profile.label },
        memberPolicy: profile.memberPolicy || { employeeLimit: null },
        snapshotSources: {
          primary: {
            profile: profile.revision,
            profileContactAssignments: {
              phone: phoneContact?.revision ?? null,
              email: emailContact?.revision ?? null,
            },
            contactIdentity: identity.revision,
            identityContacts: {
              phone: identityPhone?.revision ?? null,
              email: identityEmail?.revision ?? null,
            },
            privateData: profile.privateDataRevision,
          },
        },
      });
    }

    const profileIds = memberships.map((m) => m.profileId);
    const grantDocs = await this.grants
      .find({ profileId: { $in: profileIds } })
      .lean();
    const accessRevision = grantDocs.reduce(
      (max, g) => Math.max(max, g.revision || 0),
      1,
    );

    return new MstyleResult(
      schema({
        subject: identity.subject,
        identityStatus: identity.identityStatus,
        authVersion: identity.authVersion,
        identityDisplay: identity.displayName || undefined,
        profiles,
        physicalAccessFacts: {
          revision: accessRevision,
          grants: grantDocs.map(grantDto),
        },
        contextRevision: identity.contextRevision,
        generatedAt: nowIso(),
      }),
    );
  }

  async getIdentity(subject: string): Promise<MstyleResult> {
    const identity = await this.requireIdentity(subject);
    const dto = await this.identityWithMasks(identity);
    return new MstyleResult(schema({ identity: dto }), 200, {
      ETag: etag('identity', identity.revision),
    });
  }

  async patchIdentity(
    subject: string,
    dto: PatchIdentityDto,
    ifMatch?: string,
  ): Promise<MstyleResult> {
    const identity = await this.requireIdentity(subject);
    this.assertMatch(ifMatch, 'identity', identity.revision);
    if (dto.displayName !== undefined) identity.displayName = dto.displayName;
    if (dto.name) {
      identity.name = {
        lastName: dto.name.lastName ?? identity.name?.lastName ?? null,
        firstName: dto.name.firstName ?? identity.name?.firstName ?? null,
        middleName: dto.name.middleName ?? identity.name?.middleName ?? null,
      };
    }
    identity.revision += 1;
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'identity.updated',
        aggregate: { type: 'identity', id: subject },
        subject,
      }),
    ];
    return new MstyleResult(
      schema({
        identity: await this.identityWithMasks(identity),
        identityRevision: identity.revision,
        contextRevision: identity.contextRevision,
        eventIds,
      }),
      200,
      { ETag: etag('identity', identity.revision) },
    );
  }

  async getProfile(profileId: string): Promise<MstyleResult> {
    const profile = await this.requireProfile(profileId);
    return new MstyleResult(schema(safeProfile(profile)), 200, {
      ETag: etag('profile', profile.revision),
    });
  }

  async patchProfile(
    profileId: string,
    dto: PatchProfileDto,
    ifMatch?: string,
  ): Promise<MstyleResult> {
    const profile = await this.requireProfile(profileId);
    this.assertMatch(ifMatch, 'profile', profile.revision);
    if (dto.label !== undefined) profile.label = dto.label;
    if (dto.companyShortName !== undefined) {
      profile.companyShortName = dto.companyShortName;
    }
    if (dto.memberPolicy) {
      profile.memberPolicy = {
        employeeLimit:
          dto.memberPolicy.employeeLimit === undefined
            ? (profile.memberPolicy?.employeeLimit ?? null)
            : dto.memberPolicy.employeeLimit,
      };
    }
    profile.revision += 1;
    await profile.save();
    const eventIds = [
      await this.events.emit({
        type: 'profile.updated',
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    const contextRevision = await this.bumpMembersContext(profileId);
    return new MstyleResult(
      schema({
        ...safeProfile(profile),
        contextRevision,
        eventIds,
      }),
      200,
      { ETag: etag('profile', profile.revision) },
    );
  }

  async searchProfiles(dto: SearchProfilesDto): Promise<MstyleResult> {
    const limit = dto.limit || 20;
    const filter: Record<string, unknown> = {};
    if (dto.query?.profileId) filter.profileId = dto.query.profileId;
    if (dto.query?.label) {
      filter.label = { $regex: dto.query.label, $options: 'i' };
    }
    let profileIds: string[] | null = null;
    if (dto.query?.phone || dto.query?.email) {
      const type = dto.query.phone ? 'phone' : 'email';
      const raw = type === 'phone' ? dto.query.phone! : dto.query.email!;
      const normalized =
        type === 'phone' ? normalizeRuMobilePhone(raw) : normalizeEmail(raw);
      if (!normalized) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${normalized}`);
      const contact = await this.contacts.findOne({ type, valueHash });
      if (!contact) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      const assigns = await this.assignments
        .find({ contactId: contact.contactId })
        .lean();
      profileIds = assigns.map((a) => a.profileId);
      filter.profileId = { $in: profileIds };
    }
    const rows = await this.profiles
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items: Record<string, unknown>[] = [];
    for (const row of slice) {
      const masks = await this.profileContactMasks(row.profileId);
      items.push({
        profileId: row.profileId,
        status: row.status,
        profileType: row.type,
        legalForm: row.legalForm,
        profileRevision: row.revision,
        privateDataRevision: row.privateDataRevision,
        privateDataComplete: row.privateDataComplete,
        memberPolicy: row.memberPolicy,
        updatedAt: (row as any).updatedAt?.toISOString?.() || nowIso(),
        display: { label: row.label, contactMasks: masks },
      });
    }
    return new MstyleResult(
      schema({
        items,
        nextCursor: hasMore ? slice[slice.length - 1].profileId : null,
        generatedAt: nowIso(),
      }),
    );
  }

  async onboard(dto: OnboardingDto): Promise<MstyleResult> {
    const identity = await this.identities.ensureStandalone({
      identifierType: dto.owner.identifier.type,
      identifierValue: dto.owner.identifier.value,
      displayName: dto.owner.displayName,
      name: dto.owner.name,
      status: 'invited',
    });
    await this.identities.syncContact(
      identity.subject,
      dto.owner.identifier.type,
      dto.owner.identifier.value,
    );
    const profile = await this.profiles.create({
      profileId: Ids.profile(),
      type: dto.profileType,
      legalForm:
        dto.legalForm ?? (dto.profileType === 'company' ? 'ooo' : null),
      status: 'draft',
      label: dto.label,
      companyShortName: dto.companyShortName ?? null,
      revision: 1,
      privateDataRevision: null,
      privateDataComplete: false,
      memberPolicy: { employeeLimit: null },
    });
    const membership = await this.memberships.create({
      membershipId: Ids.membership(),
      subject: identity.subject,
      profileId: profile.profileId,
      role: 'owner',
      status: 'invited',
      validFrom: nowIso(),
      validUntil: null,
      revision: 1,
    });
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'resident.onboarded',
        aggregate: { type: 'profile', id: profile.profileId },
        subject: identity.subject,
        profileId: profile.profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        subject: identity.subject,
        profileId: profile.profileId,
        ownerMembershipId: membership.membershipId,
        identityRevision: identity.revision,
        profileRevision: profile.revision,
        membershipRevision: membership.revision,
        assignmentSetRevision: profile.assignmentSetRevision,
        privateDataRevision: profile.privateDataRevision,
        invitationStatus: 'invited',
        contextRevision: identity.contextRevision,
        eventIds,
      }),
      201,
      { ETag: etag('profile', profile.revision) },
    );
  }

  async lifecycle(profileId: string, dto: LifecycleDto, ifMatch?: string) {
    const profile = await this.requireProfile(profileId);
    this.assertMatch(ifMatch, 'profile', profile.revision);
    const next =
      dto.transition === 'activate'
        ? 'active'
        : dto.transition === 'suspend'
          ? 'suspended'
          : 'closed';
    profile.status = next;
    profile.revision += 1;
    await profile.save();
    const eventIds = [
      await this.events.emit({
        type: `profile.${dto.transition}`,
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    const contextRevision = await this.bumpMembersContext(profileId);
    return new MstyleResult(
      schema({
        profileId,
        profileStatus: profile.status,
        profileRevision: profile.revision,
        contextRevision,
        eventIds,
      }),
      200,
      { ETag: etag('profile', profile.revision) },
    );
  }

  async requestDeletion(profileId: string, dto: DeletionRequestDto) {
    await this.requireProfile(profileId);
    const createdAt = nowIso();
    const eventIds = [
      await this.events.emit({
        type: 'profile.deletion_requested',
        aggregate: { type: 'profile', id: profileId },
        profileId,
        payload: { reasonCodes: dto.reasonCodes },
      }),
    ];
    const row = await this.deletions.create({
      deletionRequestId: Ids.deletion(),
      profileId,
      status: 'pending',
      reasonCodes: dto.reasonCodes,
      deletionRequestRevision: 1,
      createdAtIso: createdAt,
      latestEventId: eventIds[0],
    });
    return new MstyleResult(
      schema({
        deletionRequestId: row.deletionRequestId,
        profileId,
        status: 'pending',
        deletionRequestRevision: 1,
        eventIds,
        createdAt,
      }),
      202,
    );
  }

  async getDeletion(deletionRequestId: string) {
    const row = await this.deletions.findOne({ deletionRequestId });
    if (!row) problem(404, 'NOT_FOUND');
    return new MstyleResult(
      schema({
        deletionRequestId: row.deletionRequestId,
        profileId: row.profileId,
        status: row.status,
        reasonCodes: row.reasonCodes,
        deletionRequestRevision: row.deletionRequestRevision,
        createdAt: row.createdAtIso,
        completedAt: row.completedAt,
        latestEventId: row.latestEventId,
      }),
    );
  }

  async createChangeRequest(profileId: string, dto: ChangeRequestDto) {
    const profile = await this.requireProfile(profileId);
    const existing = await this.changeRequests.findOne({
      profileId,
      status: 'pending',
    });
    if (existing) problem(409, 'CONFLICT', { title: 'Pending request exists' });
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const eventIds = [
      await this.events.emit({
        type: 'profile.change_requested',
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    const row = await this.changeRequests.create({
      changeRequestId: Ids.changeRequest(),
      profileId,
      status: 'pending',
      changeRequestRevision: 1,
      profileRevisionAtRequest: profile.revision,
      changedFieldCodes: dto.fieldCodes,
      valuesEnc: dto.values
        ? encryptJson(this.cfg.piiSecret(), dto.values)
        : undefined,
      reasonCode: dto.reasonCode || '',
      expiresAt,
    });
    return new MstyleResult(
      schema({
        changeRequestId: row.changeRequestId,
        profileId,
        status: 'pending',
        changeRequestRevision: 1,
        profileRevisionAtRequest: profile.revision,
        expiresAt,
        eventIds,
      }),
      201,
      { ETag: etag('change-request', 1) },
    );
  }

  async currentChangeRequest(profileId: string) {
    await this.requireProfile(profileId);
    const row = await this.changeRequests.findOne({
      profileId,
      status: 'pending',
    });
    if (!row) problem(404, 'NOT_FOUND');
    return new MstyleResult(
      schema({
        changeRequestId: row.changeRequestId,
        profileId,
        status: row.status,
        changeRequestRevision: row.changeRequestRevision,
        profileRevisionAtRequest: row.profileRevisionAtRequest,
        changedFieldCodes: row.changedFieldCodes,
        reasonCode: row.reasonCode,
        expiresAt: row.expiresAt,
        createdAt: (row as any).createdAt?.toISOString?.() || nowIso(),
      }),
      200,
      { ETag: etag('change-request', row.changeRequestRevision) },
    );
  }

  async decideChange(changeRequestId: string, dto: ChangeDecisionDto) {
    const row = await this.changeRequests.findOne({ changeRequestId });
    if (!row || row.status !== 'pending') problem(404, 'NOT_FOUND');
    row.status = dto.decision === 'approve' ? 'approved' : 'rejected';
    row.changeRequestRevision += 1;
    const eventIds = [
      await this.events.emit({
        type: `profile.change_${row.status}`,
        aggregate: { type: 'change_request', id: changeRequestId },
        profileId: row.profileId,
      }),
    ];
    const extra: Record<string, unknown> = {};
    if (dto.decision === 'approve') {
      const profile = await this.requireProfile(row.profileId);
      if (row.valuesEnc) {
        const values = decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          row.valuesEnc,
        );
        const current = await this.privateData.findOne({
          partyType: 'resident_profile',
          partyId: row.profileId,
        });
        const merged = {
          ...(current
            ? decryptJson<Record<string, unknown>>(
                this.cfg.piiSecret(),
                current.valuesEnc,
              )
            : {}),
          ...values,
        };
        if (current) {
          current.valuesEnc = encryptJson(this.cfg.piiSecret(), merged);
          current.revision += 1;
          await current.save();
          profile.privateDataRevision = current.revision;
        } else {
          const created = await this.privateData.create({
            partyType: 'resident_profile',
            partyId: row.profileId,
            profileType: profile.type,
            legalForm: profile.legalForm,
            revision: 1,
            editPolicy: 'self_service',
            valuesEnc: encryptJson(this.cfg.piiSecret(), merged),
          });
          profile.privateDataRevision = created.revision;
        }
        extra.privateDataRevision = profile.privateDataRevision;
      }
      profile.revision += 1;
      await profile.save();
      extra.profileRevision = profile.revision;
      extra.contextRevision = await this.bumpMembersContext(row.profileId);
    }
    await row.save();
    return new MstyleResult(
      schema({
        changeRequestId,
        status: row.status,
        changeRequestRevision: row.changeRequestRevision,
        eventIds,
        ...extra,
      }),
      200,
      { ETag: etag('change-request', row.changeRequestRevision) },
    );
  }

  async cancelChange(changeRequestId: string) {
    const row = await this.changeRequests.findOne({ changeRequestId });
    if (!row || row.status !== 'pending') problem(404, 'NOT_FOUND');
    row.status = 'cancelled';
    row.changeRequestRevision += 1;
    await row.save();
    const eventIds = [
      await this.events.emit({
        type: 'profile.change_cancelled',
        aggregate: { type: 'change_request', id: changeRequestId },
        profileId: row.profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        changeRequestId,
        status: 'cancelled',
        changeRequestRevision: row.changeRequestRevision,
        eventIds,
      }),
      200,
      { ETag: etag('change-request', row.changeRequestRevision) },
    );
  }

  async physicalAccess(profileId: string) {
    const profile = await this.requireProfile(profileId);
    const grants = await this.grants.find({ profileId }).lean();
    return new MstyleResult(
      schema({
        profileId,
        accessFactsRevision: profile.accessFactsRevision,
        grants: grants.map(grantDto),
        generatedAt: nowIso(),
      }),
    );
  }

  async listMemberships(profileId: string) {
    const profile = await this.requireProfile(profileId);
    const rows = await this.memberships.find({ profileId }).lean();
    const activeEmployeeCount = rows.filter(
      (m) => m.role === 'employee' && m.status === 'active',
    ).length;
    const items: Record<string, unknown>[] = [];
    for (const row of rows) {
      const identity = await this.identityModel.findOne({
        subject: row.subject,
      });
      items.push({
        membership: membershipDto(row),
        identityDisplay: {
          displayName: identity?.displayName || '',
          contactMasks: identity
            ? await this.contactMasks(identity.subject)
            : [],
        },
      });
    }
    return new MstyleResult(
      schema({
        profileId,
        membershipSetRevision: profile.membershipSetRevision,
        policy: {
          profileRevision: profile.revision,
          employeeLimit: profile.memberPolicy?.employeeLimit ?? null,
          activeEmployeeCount,
          canAdd:
            profile.memberPolicy?.employeeLimit == null ||
            activeEmployeeCount < profile.memberPolicy.employeeLimit,
        },
        items,
        nextCursor: null,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async addMembership(profileId: string, dto: CreateMembershipDto) {
    const profile = await this.requireProfile(profileId);
    const identity = await this.identities.ensureStandalone({
      identifierType: dto.identifier.type,
      identifierValue: dto.identifier.value,
      displayName: dto.displayName,
      status: 'invited',
    });
    await this.identities.syncContact(
      identity.subject,
      dto.identifier.type,
      dto.identifier.value,
    );
    const existing = await this.memberships.findOne({
      profileId,
      subject: identity.subject,
    });
    if (existing && existing.status !== 'revoked') {
      problem(409, 'CONFLICT', { title: 'Membership already exists' });
    }
    let membership = existing;
    if (existing) {
      existing.status = 'invited';
      existing.role = 'employee';
      existing.validFrom = nowIso();
      existing.revision += 1;
      await existing.save();
    } else {
      membership = await this.memberships.create({
        membershipId: Ids.membership(),
        subject: identity.subject,
        profileId,
        role: 'employee',
        status: 'invited',
        validFrom: nowIso(),
        validUntil: null,
        revision: 1,
      });
    }
    if (!membership) problem(503, 'UPSTREAM_UNAVAILABLE');
    profile.membershipSetRevision += 1;
    await profile.save();
    const eventIds = [
      await this.events.emit({
        type: 'membership.invited',
        aggregate: { type: 'membership', id: membership.membershipId },
        subject: identity.subject,
        profileId,
      }),
    ];
    identity.contextRevision += 1;
    await identity.save();
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        identityDisplay: {
          displayName: identity.displayName || '',
          contactMasks: await this.contactMasks(identity.subject),
        },
        invitationStatus: 'invited',
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions: [identity.contextRevision],
        eventIds,
      }),
      201,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async patchMembership(membershipId: string, dto: PatchMembershipDto) {
    const membership = await this.memberships.findOne({ membershipId });
    if (!membership || membership.role === 'owner') problem(404, 'NOT_FOUND');
    if (dto.status) membership.status = dto.status;
    if (dto.validFrom !== undefined) membership.validFrom = dto.validFrom;
    if (dto.validUntil !== undefined) membership.validUntil = dto.validUntil;
    membership.revision += 1;
    await membership.save();
    const profile = await this.requireProfile(membership.profileId);
    profile.membershipSetRevision += 1;
    await profile.save();
    const identity = await this.requireIdentity(membership.subject);
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'membership.updated',
        aggregate: { type: 'membership', id: membershipId },
        subject: membership.subject,
        profileId: membership.profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions: [identity.contextRevision],
        eventIds,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async revokeMembership(membershipId: string) {
    const membership = await this.memberships.findOne({ membershipId });
    if (!membership || membership.role === 'owner') problem(404, 'NOT_FOUND');
    membership.status = 'revoked';
    membership.revision += 1;
    await membership.save();
    const profile = await this.requireProfile(membership.profileId);
    profile.membershipSetRevision += 1;
    await profile.save();
    const identity = await this.requireIdentity(membership.subject);
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'membership.revoked',
        aggregate: { type: 'membership', id: membershipId },
        subject: membership.subject,
        profileId: membership.profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions: [identity.contextRevision],
        eventIds,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async transferOwner(profileId: string, dto: OwnerTransferDto) {
    const profile = await this.requireProfile(profileId);
    const current = await this.memberships.findOne({
      profileId,
      role: 'owner',
      status: { $ne: 'revoked' },
    });
    if (!current) problem(404, 'NOT_FOUND');
    const incoming = await this.memberships.findOne({
      profileId,
      subject: dto.newOwnerSubject,
    });
    if (!incoming) problem(404, 'NOT_FOUND');
    current.role = 'employee';
    current.revision += 1;
    incoming.role = 'owner';
    incoming.status = 'active';
    incoming.revision += 1;
    await current.save();
    await incoming.save();
    profile.revision += 1;
    profile.membershipSetRevision += 1;
    await profile.save();
    const contextRevisions = await Promise.all(
      [current.subject, incoming.subject].map(async (subject) => {
        const identity = await this.requireIdentity(subject);
        identity.contextRevision += 1;
        await identity.save();
        return identity.contextRevision;
      }),
    );
    const eventIds = [
      await this.events.emit({
        type: 'membership.owner_transferred',
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        profileId,
        previousOwner: membershipDto(current),
        newOwner: membershipDto(incoming),
        profileRevision: profile.revision,
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions,
        eventIds,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async startContactChallenge(subject: string, dto: ContactChallengeDto) {
    await this.requireIdentity(subject);
    const normalized =
      dto.type === 'phone'
        ? normalizeRuMobilePhone(dto.value)
        : normalizeEmail(dto.value);
    if (!normalized) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          { field: 'value', code: 'invalid', message: 'Invalid contact' },
        ],
      });
    }
    const latest = await this.contacts
      .findOne({ subject, type: dto.type })
      .sort({ revision: -1 });
    const now = Date.now();
    const challenge = await this.challenges.create({
      challengeId: Ids.challenge(),
      kind: 'contact',
      clientId: 'session',
      status: 'awaiting_code',
      channel: dto.type === 'phone' ? 'sms' : 'email',
      identifierType: dto.type,
      subject,
      isDummy: false,
      codeHash: await bcrypt.hash(this.cfg.mockOtp(), 8),
      codeLength: CODE_LENGTH,
      verifyAttempts: 0,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
      resendAfter: new Date(now + RESEND_MIN_MS),
      contactType: dto.type,
      displayMasked: maskContact(dto.type, normalized),
      expectedContactValueRevision: latest?.revision ?? 0,
      pendingValueEnc: encryptJson(this.cfg.piiSecret(), normalized),
    });
    const eventIds = [
      await this.events.emit({
        type: 'contact.challenge_started',
        aggregate: { type: 'identity', id: subject },
        subject,
      }),
    ];
    return new MstyleResult(
      schema({
        challengeId: challenge.challengeId,
        contactType: dto.type,
        displayMasked: challenge.displayMasked,
        expectedContactValueRevision: challenge.expectedContactValueRevision,
        expiresAt: challenge.expiresAt.toISOString(),
        resendAfter: challenge.resendAfter.toISOString(),
        eventIds,
      }),
      201,
    );
  }

  async verifyContactChallenge(
    subject: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    const identity = await this.requireIdentity(subject);
    const challenge = await this.challenges.findOne({ challengeId, subject });
    if (!challenge || challenge.kind !== 'contact') problem(404, 'NOT_FOUND');
    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.status = 'expired';
      await challenge.save();
      problem(410, 'CHALLENGE_EXPIRED');
    }
    if (challenge.status === 'consumed') problem(409, 'CHALLENGE_CONSUMED');
    const ok = await bcrypt.compare(dto.code, challenge.codeHash);
    challenge.verifyAttempts += 1;
    if (!ok) {
      await challenge.save();
      problem(401, 'INVALID_CREDENTIALS');
    }
    const value = decryptJson<string>(
      this.cfg.piiSecret(),
      challenge.pendingValueEnc!,
    );
    const type = challenge.contactType as 'phone' | 'email';
    const contact = await this.identities.syncContact(subject, type, value);
    if (!contact) problem(422, 'VALIDATION_FAILED');
    contact.verifiedAt = nowIso();
    contact.revision += 1;
    await contact.save();
    if (type === 'phone') identity.phone = value;
    else identity.email = value;
    identity.revision += 1;
    identity.contextRevision += 1;
    await identity.save();
    challenge.status = 'consumed';
    await challenge.save();
    const eventIds = [
      await this.events.emit({
        type: 'contact.verified',
        aggregate: { type: 'identity', id: subject },
        subject,
      }),
    ];
    return new MstyleResult(
      schema({
        contact: contactDto(contact, value),
        identityRevision: identity.revision,
        contextRevision: identity.contextRevision,
        eventIds,
      }),
      200,
      {
        ETag: etag('identity', identity.revision),
        'Cache-Control': 'no-store',
      },
    );
  }

  async listAssignments(profileId: string) {
    const profile = await this.requireProfile(profileId);
    const items = await this.assignments.find({ profileId }).lean();
    return new MstyleResult(
      schema({
        profileId,
        assignmentSetRevision: profile.assignmentSetRevision,
        items: items.map(assignmentDto),
      }),
      200,
      { ETag: etag('assignments', profile.assignmentSetRevision) },
    );
  }

  async replaceAssignments(profileId: string, dto: PatchAssignmentsDto) {
    const profile = await this.requireProfile(profileId);
    if (dto.assignmentSetRevision !== profile.assignmentSetRevision) {
      problem(412, 'PRECONDITION_FAILED');
    }
    await this.assignments.deleteMany({ profileId });
    const items: ReturnType<typeof assignmentDto>[] = [];
    for (const item of dto.items) {
      const contact = await this.contacts.findOne({
        contactId: item.contactId,
        subject: item.subject,
      });
      if (!contact) {
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            {
              field: 'contactId',
              code: 'not_found',
              message: item.contactId,
            },
          ],
        });
      }
      const created = await this.assignments.create({
        assignmentId: Ids.assignment(),
        profileId,
        purpose: item.purpose,
        subject: item.subject,
        contactId: contact.contactId,
        contactType: contact.type,
        contactMask: contact.masked,
        contactVerified: !!contact.verifiedAt,
        priority: item.priority ?? 1,
        status: item.status || 'active',
        revision: 1,
      });
      items.push(assignmentDto(created));
    }
    profile.assignmentSetRevision += 1;
    await profile.save();
    const contextRevision = await this.bumpMembersContext(profileId);
    const eventIds = [
      await this.events.emit({
        type: 'contact_assignments.replaced',
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        profileId,
        assignmentSetRevision: profile.assignmentSetRevision,
        items,
        contextRevision,
        eventIds,
      }),
      200,
      {
        ETag: etag('assignments', profile.assignmentSetRevision),
        'Cache-Control': 'no-store',
      },
    );
  }

  async revealContacts(subject: string) {
    const identity = await this.requireIdentity(subject);
    const rows = await this.contacts.find({ subject });
    const contacts = rows.map((row) =>
      contactDto(row, decryptJson<string>(this.cfg.piiSecret(), row.valueEnc)),
    );
    return new MstyleResult(
      schema({ subject: identity.subject, contacts }),
      200,
      {
        'Cache-Control': 'no-store, private',
      },
    );
  }

  async listConsents(subject: string) {
    await this.requireIdentity(subject);
    const items = await this.consents
      .find({ partyType: 'resident', partyId: subject })
      .lean();
    const revision = items.reduce((max, i) => Math.max(max, i.revision), 1);
    return new MstyleResult(
      schema({
        subject,
        consentSetRevision: revision,
        items: items.map(consentItem),
      }),
      200,
      { ETag: etag('consents', revision), 'Cache-Control': 'no-store' },
    );
  }

  async acceptConsent(
    subject: string,
    documentCode: string,
    dto: ConsentAcceptDto,
  ) {
    await this.requireIdentity(subject);
    return this.upsertConsent(
      'resident',
      subject,
      documentCode,
      dto,
      'accepted',
    );
  }

  async withdrawConsent(subject: string, documentCode: string) {
    await this.requireIdentity(subject);
    return this.upsertConsent(
      'resident',
      subject,
      documentCode,
      {
        schemaVersion: '2.0',
        documentVersion: '',
        documentDigest: '',
      },
      'withdrawn',
    );
  }

  async upsertConsent(
    partyType: 'resident' | 'guest',
    partyId: string,
    documentCode: string,
    dto: ConsentAcceptDto,
    status: 'accepted' | 'withdrawn',
  ) {
    let row = await this.consents.findOne({ partyType, partyId, documentCode });
    const now = nowIso();
    if (!row) {
      row = await this.consents.create({
        partyType,
        partyId,
        documentCode,
        documentVersion: dto.documentVersion || '1',
        documentDigest: dto.documentDigest || '',
        documentUrl: dto.documentUrl || '',
        locale: dto.locale || 'ru-RU',
        status,
        revision: 1,
        acceptedAt: status === 'accepted' ? now : null,
        withdrawnAt: status === 'withdrawn' ? now : null,
        auditRef: Ids.event(),
      });
    } else {
      if (dto.documentVersion) row.documentVersion = dto.documentVersion;
      if (dto.documentDigest) row.documentDigest = dto.documentDigest;
      if (dto.documentUrl) row.documentUrl = dto.documentUrl;
      if (dto.locale) row.locale = dto.locale;
      row.status = status;
      row.revision += 1;
      if (status === 'accepted') row.acceptedAt = now;
      if (status === 'withdrawn') row.withdrawnAt = now;
      row.auditRef = Ids.event();
      await row.save();
    }
    const eventIds = [
      await this.events.emit({
        type: status === 'accepted' ? 'consent.accepted' : 'consent.withdrawn',
        aggregate: { type: partyType, id: partyId },
        subject: partyType === 'resident' ? partyId : undefined,
        guestPartyId: partyType === 'guest' ? partyId : undefined,
        payload: { documentCode },
      }),
    ];
    const items = await this.consents.find({ partyType, partyId }).lean();
    const revision = items.reduce(
      (max, i) => Math.max(max, i.revision),
      row.revision,
    );
    const bodyKey = partyType === 'resident' ? 'subject' : 'guestPartyId';
    return new MstyleResult(
      schema({
        [bodyKey]: partyId,
        consentSetRevision: revision,
        item: consentItem(row),
        eventIds,
      }),
      200,
      { ETag: etag('consents', revision), 'Cache-Control': 'no-store' },
    );
  }

  private async requireIdentity(subject: string) {
    const identity = await this.identities.findIdentityBySubject(subject);
    if (!identity) problem(404, 'NOT_FOUND');
    return identity;
  }

  private async requireProfile(profileId: string) {
    const profile = await this.profiles.findOne({ profileId });
    if (!profile) problem(404, 'NOT_FOUND');
    return profile;
  }

  private assertMatch(
    ifMatch: string | undefined,
    kind: string,
    revision: number,
  ) {
    const parsed = parseIfMatch(ifMatch);
    if (parsed && (parsed.kind !== kind || parsed.revision !== revision)) {
      problem(412, 'PRECONDITION_FAILED');
    }
  }

  private async identityWithMasks(identity: MstyleIdentityDocument) {
    const dto = safeIdentity(identity);
    dto.contactMasks = await this.contactMasks(identity.subject);
    return dto;
  }

  private async contactMasks(subject: string) {
    const rows = await this.contacts.find({ subject }).lean();
    return rows.map((row) => ({
      type: row.type as 'phone' | 'email',
      masked: row.masked,
    }));
  }

  private async profileContactMasks(profileId: string) {
    const assigns = await this.assignments.find({ profileId }).lean();
    return assigns.map((a) => ({
      type: a.contactType as 'phone' | 'email',
      masked: a.contactMask,
    }));
  }

  private async bumpMembersContext(profileId: string): Promise<number> {
    const members = await this.memberships.find({ profileId }).lean();
    let last = 0;
    for (const member of members) {
      const identity = await this.identityModel.findOne({
        subject: member.subject,
      });
      if (!identity) continue;
      identity.contextRevision += 1;
      await identity.save();
      last = identity.contextRevision;
    }
    return last;
  }
}
