import { MstyleConsentService } from './mstyle-v2.consent.service';
import { MstyleContactProofService } from './mstyle-v2.contact-proof';
import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { MstyleContactSelectionService } from './mstyle-v2.contact-selection';
import {
  normalizeResidentInput,
  validateResidentValues,
} from './mstyle-v2.private-values';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeRuMobilePhone } from '../../common/phone';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  decryptJson,
  encryptJson,
  hmacHex,
  normalizeEmail,
  safeEqualHex,
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
  ReasonCodeDto,
  SearchProfilesDto,
} from './mstyle-v2.dto';
import { MstyleEventsService } from './mstyle-v2.events';
import { Ids, contactIdQuery } from './mstyle-v2.ids';
import { MstyleIdentityService } from './mstyle-v2.identities';
import {
  assignmentDto,
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
    private readonly contactSelection: MstyleContactSelectionService,
    private readonly contactProof: MstyleContactProofService,
    private readonly consentService: MstyleConsentService,
  ) {}

  async getContext(subject: string): Promise<MstyleResult> {
    const identity = await this.requireIdentity(subject);
    const identityContactMasks = await this.contactMasks(subject);
    const memberships = await this.memberships.find({ subject }).lean();
    const profiles: Record<string, unknown>[] = [];
    for (const membership of memberships) {
      const profile = await this.profiles.findOne({
        profileId: membership.profileId,
      });
      if (!profile) continue;
      const selected = await this.contactSelection.select(profile.profileId);
      profiles.push({
        profileId: profile.profileId,
        membershipId: membership.membershipId,
        membershipRole: membership.role,
        membershipStatus: membership.status,
        membershipValidFrom: membership.validFrom ?? null,
        membershipValidUntil: membership.validUntil ?? null,
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
            ...selected.sourceRevisions,
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
        identityDisplay: {
          displayName: identity.displayName || '',
          contactMasks: identityContactMasks,
        },
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
        aggregate: {
          type: 'identity',
          id: subject,
          revision: identity.revision,
        },
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
        aggregate: {
          type: 'resident_profile',
          id: profileId,
          revision: profile.revision,
        },
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
    const limit = dto.limit || 100;
    const filter: Record<string, unknown> = {};
    if (dto.filters?.profileIds) {
      filter.profileId = { $in: dto.filters.profileIds };
    }
    if (dto.query?.type === 'profileId') {
      filter.profileId = dto.filters?.profileIds
        ? {
            $in: dto.filters.profileIds.filter((id) => id === dto.query!.value),
          }
        : dto.query.value;
    }
    if (dto.query?.type === 'text') {
      filter.label = {
        $regex: escapeRegex(dto.query.value),
        $options: 'i',
      };
    }
    if (dto.query?.type === 'phone' || dto.query?.type === 'email') {
      const type = dto.query.type;
      const raw = dto.query.value;
      const normalized =
        type === 'phone' ? normalizeRuMobilePhone(raw) : normalizeEmail(raw);
      if (!normalized) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${normalized}`);
      const contacts = await this.contacts.find({ type, valueHash }).lean();
      if (!contacts.length) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      const assigns = await this.assignments
        .find({ contactId: { $in: contacts.map((item) => item.contactId) } })
        .lean();
      const subjects = [
        ...new Set(contacts.map((item) => item.subject).filter(Boolean)),
      ];
      const memberships = subjects.length
        ? await this.memberships
            .find({ subject: { $in: subjects } })
            .select({ profileId: 1 })
            .lean()
        : [];
      const matchedIds = [
        ...new Set([
          ...assigns.map((row) => row.profileId),
          ...memberships.map((row) => row.profileId),
        ]),
      ];
      const allowedIds = dto.filters?.profileIds
        ? matchedIds.filter((id) => dto.filters!.profileIds.includes(id))
        : matchedIds;
      filter.profileId = { $in: allowedIds };
    }

    const direction = dto.sort?.direction === 'asc' ? 1 : -1;
    const cursorContext = profileSearchCursorContext(this.cfg, dto, direction);
    const cursor = decodeListCursor(
      dto.cursor,
      direction,
      cursorContext,
      this.cfg.idempotencySecret(),
    );
    if (cursor) {
      filter.$or =
        direction === 1
          ? [
              { updatedAt: { $gt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                profileId: { $gt: cursor.id },
              },
            ]
          : [
              { updatedAt: { $lt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                profileId: { $lt: cursor.id },
              },
            ];
    }
    const rows = await this.profiles
      .find(filter)
      .sort({ updatedAt: direction, profileId: direction })
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
        nextCursor: hasMore
          ? encodeListCursor(
              (slice[slice.length - 1] as any).updatedAt,
              slice[slice.length - 1].profileId,
              direction,
              cursorContext,
              this.cfg.idempotencySecret(),
            )
          : null,
        generatedAt: nowIso(),
      }),
    );
  }

  async onboard(dto: OnboardingDto): Promise<MstyleResult> {
    const invitation = dto.owner.invitation;
    if (!invitation.phone && !invitation.email) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'owner.invitation',
            code: 'contact_required',
            message: 'At least one owner contact is required',
          },
        ],
      });
    }
    if (
      dto.privateData.profileType !== dto.profile.type ||
      (dto.profile.type === 'company' &&
        (!dto.profile.legalForm ||
          dto.privateData.legalForm !== dto.profile.legalForm)) ||
      (dto.profile.type === 'individual' &&
        (dto.profile.legalForm != null || dto.privateData.legalForm != null))
    ) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'privateData',
            code: 'profile_type_mismatch',
            message: 'privateData must match profile type and legal form',
          },
        ],
      });
    }
    const suppliedContactTypes = new Set(
      [
        invitation.phone ? 'phone' : null,
        invitation.email ? 'email' : null,
      ].filter(Boolean),
    );
    const missingAssignmentContact = dto.initialContactAssignments.find(
      (item) => !suppliedContactTypes.has(item.source.contactType),
    );
    if (missingAssignmentContact) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'initialContactAssignments',
            code: 'contact_not_supplied',
            message: missingAssignmentContact.source.contactType,
          },
        ],
      });
    }
    const linked = await this.profiles.findOne({
      sourceLinks: {
        $elemMatch: {
          sourceSystem: dto.sourceLink.sourceSystem,
          environment: dto.sourceLink.environment,
          entityType: dto.sourceLink.entityType,
          externalId: dto.sourceLink.externalId,
        },
      },
    });
    if (linked) {
      problem(409, 'CONFLICT', {
        title: 'Source link is already assigned',
        errors: [
          {
            field: 'sourceLink.externalId',
            code: 'source_link_conflict',
            message: linked.profileId,
          },
        ],
      });
    }

    const phoneIdentity = invitation.phone
      ? await this.findIdentityByVerifiedContact('phone', invitation.phone)
      : null;
    const emailIdentity = invitation.email
      ? await this.findIdentityByVerifiedContact('email', invitation.email)
      : null;
    if (
      phoneIdentity &&
      emailIdentity &&
      phoneIdentity.subject !== emailIdentity.subject
    ) {
      problem(409, 'CONFLICT', {
        title: 'Owner contacts belong to different identities',
        errors: [
          {
            field: 'owner.invitation',
            code: 'identity_contact_conflict',
            message: 'phone and email resolve to different identities',
          },
        ],
      });
    }
    const existingIdentity = phoneIdentity || emailIdentity;
    const primaryType = invitation.phone ? 'phone' : 'email';
    const primaryValue = invitation.phone || invitation.email!;
    const identity =
      existingIdentity ||
      (await this.identities.ensureStandalone({
        identifierType: primaryType,
        identifierValue: primaryValue,
        displayName: invitation.displayName,
        status: 'invited',
      }));
    if (!identity.displayName) {
      identity.displayName = invitation.displayName;
      await identity.save();
    }
    const contactByType = new Map<string, MstyleContactDocument>();
    for (const [type, value] of [
      ['phone', invitation.phone],
      ['email', invitation.email],
    ] as const) {
      if (!value) continue;
      const before = await this.contacts.findOne({
        subject: identity.subject,
        type,
        valueHash: hmacHex(
          this.cfg.piiSecret(),
          `${type}:${
            type === 'phone'
              ? normalizeRuMobilePhone(value)
              : normalizeEmail(value)
          }`,
        ),
      });
      const contact = await this.identities.syncContact(
        identity.subject,
        type,
        value,
      );
      if (!contact) problem(422, 'VALIDATION_FAILED');
      if (!before && !existingIdentity) {
        contact.verifiedAt = null;
        await contact.save();
      }
      contactByType.set(type, contact);
    }
    const profile = await this.profiles.create({
      profileId: Ids.profile(),
      type: dto.profile.type,
      legalForm: dto.profile.legalForm ?? null,
      status: identity.identityStatus === 'active' ? 'active' : 'draft',
      label: dto.profile.label,
      companyShortName: dto.profile.companyShortName ?? null,
      revision: 1,
      privateDataRevision: 1,
      privateDataComplete: privateDataIsComplete(
        dto.privateData.data,
        dto.profile.type,
        dto.profile.legalForm,
      ),
      memberPolicy: {
        employeeLimit: dto.profile.memberPolicy?.employeeLimit ?? null,
      },
      sourceLinks: [{ ...dto.sourceLink, linkedAt: nowIso() }],
      assignmentSetRevision: 1,
      membershipSetRevision: 1,
    });
    const membership = await this.memberships.create({
      membershipId: Ids.membership(),
      subject: identity.subject,
      profileId: profile.profileId,
      role: 'owner',
      status: identity.identityStatus === 'active' ? 'active' : 'invited',
      validFrom: nowIso(),
      validUntil: null,
      revision: 1,
    });
    await this.privateData.create({
      partyType: 'resident_profile',
      partyId: profile.profileId,
      profileType: dto.privateData.profileType,
      legalForm: dto.privateData.legalForm ?? null,
      revision: 1,
      editPolicy: 'request_only',
      valuesEnc: encryptJson(this.cfg.piiSecret(), dto.privateData.data),
    });
    for (const item of dto.initialContactAssignments) {
      const contact = contactByType.get(item.source.contactType);
      if (!contact) {
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            {
              field: 'initialContactAssignments',
              code: 'contact_not_supplied',
              message: item.source.contactType,
            },
          ],
        });
      }
      await this.assignments.create({
        assignmentId: Ids.assignment(),
        profileId: profile.profileId,
        purpose: item.purpose,
        subject: identity.subject,
        contactId: contact.contactId,
        contactType: contact.type,
        contactMask: contact.masked,
        contactVerified: !!contact.verifiedAt,
        priority: item.priority,
        status: contact.verifiedAt ? 'active' : 'pending',
        revision: 1,
      });
    }
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'profile.updated',
        aggregate: {
          type: 'resident_profile',
          id: profile.profileId,
          revision: profile.revision,
        },
        subject: identity.subject,
        profileId: profile.profileId,
      }),
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: membership.membershipId,
          revision: membership.revision,
        },
        subject: identity.subject,
        profileId: profile.profileId,
      }),
      await this.events.emit({
        type: 'resident_private_data.updated',
        aggregate: {
          type: 'resident_private_data',
          id: profile.profileId,
          revision: 1,
        },
        subject: identity.subject,
        profileId: profile.profileId,
      }),
      await this.events.emit({
        type: 'resident_contact_assignments.updated',
        aggregate: {
          type: 'resident_contact_assignment_set',
          id: profile.profileId,
          revision: profile.assignmentSetRevision,
        },
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
        privateDataRevision: 1,
        invitationStatus: existingIdentity ? 'existing_identity' : 'pending',
        contextRevision: identity.contextRevision,
        eventIds,
      }),
      201,
      { ETag: etag('profile', profile.revision) },
    );
  }

  async lifecycle(profileId: string, dto: LifecycleDto, ifMatch?: string) {
    const profile = await this.requireProfile(profileId);
    this.assertRequiredMatch(ifMatch, 'profile', profile.revision);
    if (profile.status === dto.targetStatus) {
      return new MstyleResult(
        schema({
          profileId,
          profileStatus: profile.status,
          profileRevision: profile.revision,
          contextRevision: await this.ownerContextRevision(profileId),
          eventIds: [],
        }),
        200,
        { ETag: etag('profile', profile.revision) },
      );
    }
    const allowed: Record<string, readonly string[]> = {
      draft: ['active', 'closed'],
      active: ['suspended', 'closed'],
      suspended: ['active', 'closed'],
    };
    if (!allowed[profile.status]?.includes(dto.targetStatus)) {
      problem(409, 'CONFLICT', {
        title: 'Invalid profile lifecycle transition',
      });
    }
    if (dto.targetStatus === 'active') {
      const owner = await this.memberships.findOne({
        profileId,
        role: 'owner',
        status: 'active',
      });
      if (!owner || !profile.privateDataComplete) {
        problem(409, 'CONFLICT', {
          title: 'Profile is not ready for activation',
        });
      }
    }
    profile.status = dto.targetStatus;
    profile.revision += 1;
    await profile.save();
    const eventIds = [
      await this.events.emit({
        type: 'profile.updated',
        aggregate: {
          type: 'resident_profile',
          id: profileId,
          revision: profile.revision,
        },
        profileId,
        payload: {
          status: profile.status,
          reasonCode: dto.reasonCode,
        },
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

  async requestDeletion(
    profileId: string,
    dto: DeletionRequestDto,
    ifMatch?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    this.assertRequiredMatch(ifMatch, 'profile', profile.revision);
    const pending = await this.deletions.findOne({
      profileId,
      status: { $in: ['pending', 'blocked'] },
    });
    if (pending) {
      problem(409, 'CONFLICT', {
        title: 'Deletion request is already being processed',
        errors: [
          {
            field: 'profileId',
            code: 'deletion_request_exists',
            message: pending.deletionRequestId,
          },
        ],
      });
    }
    const createdAt = nowIso();
    const row = await this.deletions.create({
      deletionRequestId: Ids.deletion(),
      profileId,
      mode: dto.mode,
      reasonCode: dto.reasonCode,
      status: 'pending',
      reasonCodes: [],
      deletionRequestRevision: 1,
      createdAtIso: createdAt,
    });
    const eventIds = [
      await this.events.emit({
        type: 'resident_deletion_request.updated',
        aggregate: {
          type: 'resident_deletion_request',
          id: row.deletionRequestId,
          revision: row.deletionRequestRevision,
        },
        profileId,
        payload: { status: row.status },
      }),
    ];
    row.latestEventId = eventIds[0];
    await row.save();
    return new MstyleResult(
      schema({
        deletionRequestId: row.deletionRequestId,
        profileId,
        mode: row.mode,
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
        mode: row.mode,
        reasonCode: row.reasonCode,
        status: row.status,
        reasonCodes: row.reasonCodes,
        deletionRequestRevision: row.deletionRequestRevision,
        createdAt: row.createdAtIso,
        completedAt: row.completedAt,
        latestEventId: row.latestEventId,
      }),
    );
  }

  async createChangeRequest(
    profileId: string,
    dto: ChangeRequestDto,
    ifMatch: string | undefined,
    authorSubject: string,
  ) {
    const profile = await this.requireProfile(profileId);
    this.assertRequiredMatch(ifMatch, 'profile', profile.revision);
    await this.assertActiveOwner(authorSubject, profileId);
    const currentPrivate = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    if (
      !currentPrivate ||
      currentPrivate.editPolicy !== 'request_only' ||
      currentPrivate.revision !== dto.expectedPrivateDataRevision
    ) {
      problem(412, 'PRECONDITION_FAILED');
    }
    if (
      dto.privateData.profileType !== profile.type ||
      (profile.type === 'company' &&
        dto.privateData.legalForm !== profile.legalForm) ||
      (profile.type === 'individual' && dto.privateData.legalForm != null)
    ) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'privateData',
            code: 'profile_type_mismatch',
            message: 'privateData must match the current profile',
          },
        ],
      });
    }
    const patch = normalizeResidentInput(
      dto.privateData.data,
      profile.type,
      profile.legalForm,
    );
    const currentValues = normalizeResidentInput(
      decryptJson<Record<string, unknown>>(
        this.cfg.piiSecret(),
        currentPrivate.valuesEnc,
      ),
      profile.type,
      profile.legalForm,
    );
    validateResidentValues(
      mergeObjects(currentValues, patch),
      profile.type,
      profile.legalForm,
    );
    const changedFieldCodes = leafFieldCodes(patch);
    if (!changedFieldCodes.length) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'privateData.data',
            code: 'empty',
            message: 'At least one proposed field is required',
          },
        ],
      });
    }
    const existing = await this.changeRequests.findOne({
      profileId,
      status: 'pending',
    });
    if (existing && Date.parse(existing.expiresAt) <= Date.now()) {
      await this.expireChangeRequest(existing);
    } else if (existing)
      problem(409, 'CONFLICT', { title: 'Pending request exists' });
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const row = await this.changeRequests.create({
      changeRequestId: Ids.changeRequest(),
      profileId,
      status: 'pending',
      changeRequestRevision: 1,
      profileRevisionAtRequest: profile.revision,
      privateDataRevisionAtRequest: currentPrivate.revision,
      changedFieldCodes,
      valuesEnc: encryptJson(this.cfg.piiSecret(), patch),
      profileType: dto.privateData.profileType,
      legalForm: dto.privateData.legalForm ?? null,
      reasonCode: dto.reasonCode,
      expiresAt,
      authorSubject,
    });
    const eventIds = [
      await this.events.emit({
        type: 'resident_change_request.updated',
        aggregate: {
          type: 'resident_change_request',
          id: row.changeRequestId,
          revision: row.changeRequestRevision,
        },
        subject: authorSubject,
        profileId,
        payload: { status: row.status },
      }),
    ];
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

  async currentChangeRequest(profileId: string, residentSubject: string) {
    await this.requireProfile(profileId);
    await this.assertActiveOwner(residentSubject, profileId);
    let row = await this.changeRequests
      .findOne({ profileId })
      .sort({ createdAt: -1 });
    if (!row) problem(404, 'NOT_FOUND');
    if (row.status === 'pending' && Date.parse(row.expiresAt) <= Date.now()) {
      this.changeRequests.db.base.set('transactionAsyncLocalStorage', true);
      row = await this.changeRequests.db.transaction(
        () => this.expireChangeRequest(row!),
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    }
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

  private async expireChangeRequest(row: MstyleChangeRequestDocument) {
    const changed = await this.changeRequests.findOneAndUpdate(
      {
        changeRequestId: row.changeRequestId,
        status: 'pending',
        changeRequestRevision: row.changeRequestRevision,
      },
      { $set: { status: 'expired' }, $inc: { changeRequestRevision: 1 } },
      { new: true },
    );
    if (!changed) {
      const current = await this.changeRequests.findOne({
        changeRequestId: row.changeRequestId,
      });
      if (!current) problem(404, 'NOT_FOUND');
      return current;
    }
    await this.events.emit({
      type: 'resident_change_request.updated',
      aggregate: {
        type: 'resident_change_request',
        id: changed.changeRequestId,
        revision: changed.changeRequestRevision,
      },
      profileId: changed.profileId,
      subject: changed.authorSubject,
      payload: { status: 'expired' },
    });
    return changed;
  }

  async decideChange(
    changeRequestId: string,
    dto: ChangeDecisionDto,
    ifMatch?: string,
  ) {
    const row = await this.changeRequests.findOne({ changeRequestId });
    if (!row) problem(404, 'NOT_FOUND');
    this.assertRequiredMatch(
      ifMatch,
      'change-request',
      row.changeRequestRevision,
    );
    if (row.status !== 'pending') {
      problem(409, 'CONFLICT', { title: 'Change request is already final' });
    }
    if (Date.parse(row.expiresAt) <= Date.now()) {
      problem(409, 'CONFLICT', { title: 'Change request expired' });
    }
    row.status = dto.decision === 'approve' ? 'approved' : 'rejected';
    row.changeRequestRevision += 1;
    row.decisionReasonCode = dto.reasonCode;
    const eventIds: string[] = [];
    const extra: Record<string, unknown> = {};
    if (dto.decision === 'approve') {
      const profile = await this.requireProfile(row.profileId);
      const current = await this.privateData.findOne({
        partyType: 'resident_profile',
        partyId: row.profileId,
      });
      if (
        !current ||
        profile.revision !== row.profileRevisionAtRequest ||
        current.revision !== row.privateDataRevisionAtRequest
      ) {
        problem(412, 'PRECONDITION_FAILED');
      }
      const values = decryptJson<Record<string, unknown>>(
        this.cfg.piiSecret(),
        row.valuesEnc!,
      );
      if (current.editPolicy !== 'request_only')
        problem(412, 'PRECONDITION_FAILED');
      const merged = validateResidentValues(
        mergeObjects(
          normalizeResidentInput(
            decryptJson<Record<string, unknown>>(
              this.cfg.piiSecret(),
              current.valuesEnc,
            ),
            profile.type,
            profile.legalForm,
          ),
          normalizeResidentInput(values, profile.type, profile.legalForm),
        ),
        profile.type,
        profile.legalForm,
      );
      current.valuesEnc = encryptJson(this.cfg.piiSecret(), merged);
      current.revision += 1;
      await current.save();
      profile.privateDataRevision = current.revision;
      profile.privateDataComplete = true;
      await profile.save();
      extra.profileRevision = profile.revision;
      extra.privateDataRevision = current.revision;
      extra.contextRevision = await this.bumpMembersContext(
        row.profileId,
        row.authorSubject,
      );
      eventIds.push(
        await this.events.emit({
          type: 'resident_private_data.updated',
          aggregate: {
            type: 'resident_private_data',
            id: row.profileId,
            revision: current.revision,
          },
          profileId: row.profileId,
        }),
      );
    }
    await row.save();
    eventIds.push(
      await this.events.emit({
        type: 'resident_change_request.updated',
        aggregate: {
          type: 'resident_change_request',
          id: changeRequestId,
          revision: row.changeRequestRevision,
        },
        subject: row.authorSubject,
        profileId: row.profileId,
        payload: { status: row.status },
      }),
    );
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

  async cancelChange(
    changeRequestId: string,
    dto: ReasonCodeDto,
    ifMatch: string | undefined,
    residentSubject: string,
  ) {
    const row = await this.changeRequests.findOne({ changeRequestId });
    if (!row) problem(404, 'NOT_FOUND');
    if (row.authorSubject !== residentSubject) problem(404, 'NOT_FOUND');
    this.assertRequiredMatch(
      ifMatch,
      'change-request',
      row.changeRequestRevision,
    );
    if (row.status !== 'pending') {
      problem(409, 'CONFLICT', { title: 'Change request is already final' });
    }
    row.status = 'cancelled';
    row.decisionReasonCode = dto.reasonCode;
    row.changeRequestRevision += 1;
    await row.save();
    const eventIds = [
      await this.events.emit({
        type: 'resident_change_request.updated',
        aggregate: {
          type: 'resident_change_request',
          id: changeRequestId,
          revision: row.changeRequestRevision,
        },
        subject: residentSubject,
        profileId: row.profileId,
        payload: { status: row.status },
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

  async physicalAccess(profileId: string, residentSubject?: string) {
    const profile = await this.requireProfile(profileId);
    if (residentSubject) {
      await this.assertActiveMembership(residentSubject, profileId);
    }
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

  async addMembership(
    profileId: string,
    dto: CreateMembershipDto,
    ifMatch?: string,
    actorSubject?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    await this.assertActiveOwner(actorSubject || '', profileId);
    if (profile.status !== 'active')
      problem(409, 'CONFLICT', { title: 'Profile is not active' });
    this.assertRequiredMatch(
      ifMatch,
      'memberships',
      profile.membershipSetRevision,
    );
    if (
      profile.revision !== dto.expectedRevisions.profile ||
      profile.membershipSetRevision !== dto.expectedRevisions.membershipSet
    )
      problem(412, 'PRECONDITION_FAILED');
    const selected = dto.identity;
    if (!!selected.existingSubject === !!selected.invitation) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'identity',
            code: 'invalid',
            message: 'Specify existingSubject or invitation',
          },
        ],
      });
    }
    let identity: MstyleIdentityDocument;
    let existingIdentity = false;
    if (selected.existingSubject) {
      identity = await this.requireIdentity(selected.existingSubject);
      existingIdentity = true;
    } else {
      const invitation = selected.invitation!;
      const email = invitation.email
        ? normalizeEmail(invitation.email)
        : undefined;
      const phone = invitation.phone
        ? normalizeRuMobilePhone(invitation.phone)
        : undefined;
      if (!email && !phone)
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            {
              field: 'identity.invitation',
              code: 'required',
              message: 'Email or phone is required',
            },
          ],
        });
      const byEmail = email
        ? await this.identities.findIdentityByIdentifier('email', email)
        : null;
      const byPhone = phone
        ? await this.identities.findIdentityByIdentifier('phone', phone)
        : null;
      if (byEmail && byPhone && byEmail.subject !== byPhone.subject)
        problem(409, 'CONFLICT', {
          title: 'Contacts belong to different identities',
        });
      const found = byEmail || byPhone;
      existingIdentity = !!found;
      identity =
        found ||
        (await this.identities.ensureStandalone({
          identifierType: email ? 'email' : 'phone',
          identifierValue: (email || phone)!,
          displayName: invitation.displayName.trim(),
          status: 'invited',
        }));
      if (!found) {
        identity.email = email;
        identity.phone = phone || undefined;
        await identity.save();
        await this.identities.syncContact(
          identity.subject,
          'email',
          email,
          false,
        );
        await this.identities.syncContact(
          identity.subject,
          'phone',
          phone,
          false,
        );
      }
    }
    if (!['active', 'invited'].includes(identity.identityStatus))
      problem(409, 'CONFLICT', {
        title: 'Identity is not available for invitation',
      });
    await this.assertCanBeEmployee(identity.subject, profileId);
    await this.assertEmployeeLimit(profile);
    const existing = await this.memberships.findOne({
      profileId,
      subject: identity.subject,
    });
    if (existing && existing.status !== 'revoked')
      problem(409, 'CONFLICT', { title: 'Membership already exists' });
    const status = identity.identityStatus === 'active' ? 'active' : 'invited';
    let membership = existing;
    if (membership) {
      membership.status = status;
      membership.role = 'employee';
      membership.validFrom = nowIso();
      membership.validUntil = null;
      membership.revision += 1;
      await membership.save();
    } else {
      membership = await this.memberships.create({
        membershipId: Ids.membership(),
        subject: identity.subject,
        profileId,
        role: 'employee',
        status,
        validFrom: nowIso(),
        validUntil: null,
        revision: 1,
      });
    }
    profile.membershipSetRevision += 1;
    await profile.save();
    const contextRevisions = await this.bumpMembershipContexts(
      profileId,
      identity.subject,
    );
    const eventIds = [
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: membership.membershipId,
          revision: membership.revision,
        },
        subject: identity.subject,
        profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        identityDisplay: {
          displayName: identity.displayName || '',
          contactMasks: await this.contactMasks(identity.subject),
        },
        invitationStatus: existingIdentity ? 'existing_identity' : 'pending',
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions,
        eventIds,
      }),
      201,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async patchMembership(
    membershipId: string,
    dto: PatchMembershipDto,
    ifMatch?: string,
    residentSubject?: string,
  ) {
    const membership = await this.memberships.findOne({ membershipId });
    if (!membership || membership.role === 'owner') problem(404, 'NOT_FOUND');
    const profile = await this.requireProfile(membership.profileId);
    this.assertRequiredMatch(
      ifMatch,
      'memberships',
      profile.membershipSetRevision,
    );
    await this.assertActiveOwner(residentSubject!, membership.profileId);
    const validFrom =
      dto.validFrom !== undefined ? dto.validFrom : membership.validFrom;
    const validUntil =
      dto.validUntil !== undefined ? dto.validUntil : membership.validUntil;
    if (
      validFrom != null &&
      validUntil != null &&
      Date.parse(validUntil) <= Date.parse(validFrom)
    ) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'validUntil',
            code: 'invalid_range',
            message: 'validUntil must be later than validFrom',
          },
        ],
      });
    }
    if (dto.status === 'active') {
      const identity = await this.requireIdentity(membership.subject);
      const effectiveValidUntil =
        dto.validUntil !== undefined ? dto.validUntil : membership.validUntil;
      if (
        identity.identityStatus !== 'active' ||
        profile.status !== 'active' ||
        membership.status === 'revoked' ||
        (effectiveValidUntil != null &&
          Date.parse(effectiveValidUntil) <= Date.now())
      ) {
        problem(409, 'CONFLICT', {
          title: 'Membership cannot be activated',
        });
      }
      await this.assertCanBeEmployee(
        membership.subject,
        membership.profileId,
        membership.membershipId,
      );
      if (membership.status !== 'active')
        await this.assertEmployeeLimit(profile);
    }
    if (dto.status) membership.status = dto.status;
    if (dto.validFrom !== undefined) membership.validFrom = dto.validFrom;
    if (dto.validUntil !== undefined) membership.validUntil = dto.validUntil;
    membership.revision += 1;
    await membership.save();
    profile.membershipSetRevision += 1;
    await profile.save();
    const contextRevisions = await this.bumpMembershipContexts(
      membership.profileId,
      membership.subject,
    );
    const eventIds = [
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: membershipId,
          revision: membership.revision,
        },
        subject: membership.subject,
        profileId: membership.profileId,
        payload: { reasonCode: dto.reasonCode },
      }),
    ];
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions,
        eventIds,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async revokeMembership(
    membershipId: string,
    dto: ReasonCodeDto,
    ifMatch?: string,
    residentSubject?: string,
  ) {
    const membership = await this.memberships.findOne({ membershipId });
    if (!membership || membership.role === 'owner') problem(404, 'NOT_FOUND');
    const profile = await this.requireProfile(membership.profileId);
    this.assertRequiredMatch(
      ifMatch,
      'memberships',
      profile.membershipSetRevision,
    );
    await this.assertActiveOwner(residentSubject!, membership.profileId);
    membership.status = 'revoked';
    membership.revision += 1;
    await membership.save();
    profile.membershipSetRevision += 1;
    await profile.save();
    const contextRevisions = await this.bumpMembershipContexts(
      membership.profileId,
      membership.subject,
    );
    const eventIds = [
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: membershipId,
          revision: membership.revision,
        },
        subject: membership.subject,
        profileId: membership.profileId,
        payload: { status: membership.status, reasonCode: dto.reasonCode },
      }),
    ];
    return new MstyleResult(
      schema({
        membership: membershipDto(membership),
        membershipSetRevision: profile.membershipSetRevision,
        contextRevisions,
        eventIds,
      }),
      200,
      { ETag: etag('memberships', profile.membershipSetRevision) },
    );
  }

  async transferOwner(
    profileId: string,
    dto: OwnerTransferDto,
    residentSubject: string,
  ) {
    const profile = await this.requireProfile(profileId);
    if (
      profile.revision !== dto.expectedProfileRevision ||
      profile.membershipSetRevision !== dto.expectedMembershipSetRevision
    ) {
      problem(412, 'PRECONDITION_FAILED');
    }
    const current = await this.memberships.findOne({
      profileId,
      role: 'owner',
      status: 'active',
    });
    if (!current || !membershipIsEffective(current)) problem(404, 'NOT_FOUND');
    if (current.subject !== residentSubject) problem(404, 'NOT_FOUND');
    const incoming = await this.memberships.findOne({
      profileId,
      subject: dto.newOwnerSubject,
    });
    if (
      !incoming ||
      incoming.role !== 'employee' ||
      !membershipIsEffective(incoming)
    ) {
      problem(404, 'NOT_FOUND');
    }
    await this.assertCanBeEmployee(
      current.subject,
      profileId,
      current.membershipId,
    );
    await this.assertCanBeOwner(
      incoming.subject,
      profileId,
      incoming.membershipId,
    );
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
    const contextRevisions: { subject: string; contextRevision: number }[] = [];
    for (const subject of [current.subject, incoming.subject]) {
      const identity = await this.requireIdentity(subject);
      identity.contextRevision += 1;
      await identity.save();
      contextRevisions.push({
        subject,
        contextRevision: identity.contextRevision,
      });
    }
    const eventIds = [
      await this.events.emit({
        type: 'profile.updated',
        aggregate: {
          type: 'resident_profile',
          id: profileId,
          revision: profile.revision,
        },
        profileId,
        payload: { reasonCode: dto.reasonCode },
      }),
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: current.membershipId,
          revision: current.revision,
        },
        subject: current.subject,
        profileId,
      }),
      await this.events.emit({
        type: 'resident_membership.updated',
        aggregate: {
          type: 'resident_membership',
          id: incoming.membershipId,
          revision: incoming.revision,
        },
        subject: incoming.subject,
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
    const type = dto.contactType ?? dto.type;
    if (type !== 'phone' && type !== 'email') problem(422, 'VALIDATION_FAILED');
    const normalized =
      type === 'phone'
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
      .findOne({ subject, type: type })
      .sort({ revision: -1 });
    const challenge = await this.contactProof.start(
      { kind: 'contact', subject },
      type,
      normalized,
      latest?.revision ?? 0,
    );
    const eventIds = [
      await this.events.emit({
        type: 'identity.updated',
        aggregate: {
          type: 'identity',
          id: subject,
          revision: (await this.requireIdentity(subject)).revision,
        },
        subject,
      }),
    ];
    return new MstyleResult(
      schema({
        challengeId: challenge.challengeId,
        contactType: type,
        displayMasked: challenge.displayMasked,
        expectedContactValueRevision: challenge.expectedContactValueRevision,
        expiresAt: challenge.expiresAt.toISOString(),
        resendAfter: challenge.resendAfter.toISOString(),
        eventIds,
      }),
      201,
    );
  }

  async prepareContactVerification(
    subject: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    await this.contactProof.verify(
      { kind: 'contact', subject },
      challengeId,
      dto.code,
    );
  }

  async verifyContactChallenge(
    subject: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    void dto;
    const identity = await this.requireIdentity(subject);
    const challenge = await this.contactProof.consume(
      { kind: 'contact', subject },
      challengeId,
    );
    const value = decryptJson<string>(
      this.cfg.piiSecret(),
      challenge.pendingValueEnc!,
    );
    const type = challenge.contactType as 'phone' | 'email';
    const latest = await this.contacts
      .findOne({ subject, type })
      .sort({ revision: -1 });
    if ((latest?.revision ?? 0) !== challenge.baseContactValueRevision)
      problem(412, 'PRECONDITION_FAILED');
    const contact = await this.identities.syncContact(subject, type, value);
    if (!contact) problem(422, 'VALIDATION_FAILED');
    contact.verifiedAt = nowIso();
    contact.revision = Math.max(latest?.revision ?? 0, contact.revision) + 1;
    await contact.save();
    if (type === 'phone') identity.phone = value;
    else identity.email = value;
    identity.revision += 1;
    identity.contextRevision += 1;
    await identity.save();
    const eventIds = [
      await this.events.emit({
        type: 'identity.updated',
        aggregate: {
          type: 'identity',
          id: subject,
          revision: identity.revision,
        },
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

  async replaceAssignments(
    profileId: string,
    dto: PatchAssignmentsDto,
    ifMatch?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    this.assertRequiredMatch(
      ifMatch,
      'assignments',
      profile.assignmentSetRevision,
    );
    const previous = await this.assignments.find({ profileId });
    const prepared: Record<string, unknown>[] = [];
    const activePurposeTypes = new Set<string>();
    const allKeys = new Set<string>();
    for (const item of dto.assignments) {
      const contact = await this.contacts.findOne({
        contactId: contactIdQuery(item.contactId),
        subject: item.subject,
      });
      if (!contact || !contact.verifiedAt)
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            {
              field: 'contactId',
              code: contact ? 'not_verified' : 'not_found',
              message: item.contactId,
            },
          ],
        });
      const member = await this.memberships.findOne({
        profileId,
        subject: item.subject,
        status: 'active',
      });
      if (!membershipIsEffective(member))
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            { field: 'subject', code: 'not_member', message: item.subject },
          ],
        });
      const key = item.purpose + ':' + contact.contactId;
      if (allKeys.has(key))
        problem(409, 'CONFLICT', { title: 'Duplicate assignment' });
      allKeys.add(key);
      if ((item.status || 'active') === 'active') {
        const purposeType = item.purpose + ':' + contact.type;
        if (activePurposeTypes.has(purposeType))
          problem(409, 'CONFLICT', {
            title:
              'Only one active assignment is allowed per purpose and contact type',
          });
        activePurposeTypes.add(purposeType);
      }
      const old = previous.find(
        (row) =>
          row.purpose === item.purpose && row.contactId === contact.contactId,
      );
      prepared.push({
        assignmentId: old?.assignmentId || Ids.assignment(),
        profileId,
        purpose: item.purpose,
        subject: item.subject,
        contactId: contact.contactId,
        contactType: contact.type,
        contactMask: contact.masked,
        contactVerified: true,
        priority: item.priority ?? 1,
        status:
          item.status === 'revoked' ? 'inactive' : item.status || 'active',
        revision:
          Math.max(profile.assignmentSetRevision, old?.revision || 0) + 1,
      });
    }
    await this.assignments.deleteMany({ profileId });
    const items: ReturnType<typeof assignmentDto>[] = [];
    for (const input of prepared)
      items.push(assignmentDto(await this.assignments.create(input)));
    profile.assignmentSetRevision += 1;
    await profile.save();
    const contextRevision = await this.bumpMembersContext(profileId);
    const eventIds = [
      await this.events.emit({
        type: 'resident_contact_assignments.updated',
        aggregate: {
          type: 'resident_contact_assignment_set',
          id: profileId,
          revision: profile.assignmentSetRevision,
        },
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

  async revealContacts(subject: string, fieldCodes: string[]) {
    const identity = await this.requireIdentity(subject);
    const bad = fieldCodes.filter(
      (field) => !['phone', 'email'].includes(field),
    );
    if (bad.length)
      problem(422, 'VALIDATION_FAILED', {
        errors: bad.map((field) => ({
          field,
          code: 'unknown_field',
          message: 'Unknown fieldCode',
        })),
      });
    const rows = await this.contacts.find({
      subject,
      type: { $in: fieldCodes },
      verifiedAt: { $ne: null },
    });
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
    return this.consentService.list('resident', subject);
  }
  async acceptConsent(
    subject: string,
    documentCode: string,
    dto: ConsentAcceptDto,
    ifMatch?: string,
  ) {
    await this.requireIdentity(subject);
    return this.consentService.change(
      'resident',
      subject,
      documentCode,
      'accepted',
      dto,
      ifMatch,
    );
  }
  async withdrawConsent(
    subject: string,
    documentCode: string,
    ifMatch?: string,
    reasonCode?: string,
  ) {
    await this.requireIdentity(subject);
    return this.consentService.change(
      'resident',
      subject,
      documentCode,
      'withdrawn',
      {},
      ifMatch,
      reasonCode,
    );
  }

  private async assertEmployeeLimit(profile: MstyleProfileDocument) {
    const limit = profile.memberPolicy?.employeeLimit;
    if (limit == null) return;
    const used = await this.memberships.countDocuments({
      profileId: profile.profileId,
      role: 'employee',
      status: 'active',
    });
    if (used >= limit) {
      problem(409, 'CONFLICT', { title: 'Employee limit reached' });
    }
  }

  private async assertCanBeEmployee(
    subject: string,
    profileId: string,
    ignoreMembershipId?: string,
  ) {
    const memberships = await this.memberships.find({
      subject,
      status: 'active',
      ...(ignoreMembershipId
        ? { membershipId: { $ne: ignoreMembershipId } }
        : {}),
    });
    const ownerElsewhere = memberships.find((m) => m.role === 'owner');
    if (ownerElsewhere) {
      problem(409, 'CONFLICT', {
        title: 'Owner cannot be assigned as employee',
        errors: [
          {
            field: 'subject',
            code: 'root_user_conflict',
            message: ownerElsewhere.profileId,
          },
        ],
      });
    }
    const employeeElsewhere = memberships.find(
      (m) => m.role === 'employee' && m.profileId !== profileId,
    );
    if (employeeElsewhere) {
      problem(409, 'CONFLICT', {
        title: 'Employee is already assigned to another profile',
        errors: [
          {
            field: 'subject',
            code: 'already_bound_to_other_parent',
            message: employeeElsewhere.profileId,
          },
        ],
      });
    }
  }

  private async assertCanBeOwner(
    subject: string,
    profileId: string,
    ignoreMembershipId?: string,
  ) {
    const employeeElsewhere = await this.memberships.findOne({
      subject,
      role: 'employee',
      profileId: { $ne: profileId },
      status: 'active',
      ...(ignoreMembershipId
        ? { membershipId: { $ne: ignoreMembershipId } }
        : {}),
    });
    if (employeeElsewhere) {
      problem(409, 'CONFLICT', {
        title: 'Employee cannot become owner while assigned elsewhere',
        errors: [
          {
            field: 'newOwnerSubject',
            code: 'already_bound_to_other_parent',
            message: employeeElsewhere.profileId,
          },
        ],
      });
    }
  }

  private async requireIdentity(subject: string) {
    const identity = await this.identities.findIdentityBySubject(subject);
    if (!identity) problem(404, 'NOT_FOUND');
    return identity;
  }

  private async findIdentityByVerifiedContact(
    type: 'phone' | 'email',
    rawValue: string,
  ) {
    const normalized =
      type === 'phone'
        ? normalizeRuMobilePhone(rawValue)
        : normalizeEmail(rawValue);
    if (!normalized) return null;
    const contact = await this.contacts.findOne({
      type,
      valueHash: hmacHex(this.cfg.piiSecret(), `${type}:${normalized}`),
      verifiedAt: { $ne: null },
    });
    if (!contact) return null;
    const identity = await this.identityModel.findOne({
      subject: contact.subject,
      isDummy: { $ne: true },
    });
    if (!identity) return null;
    const currentValue =
      type === 'phone'
        ? normalizeRuMobilePhone(identity.phone || '')
        : normalizeEmail(identity.email || '');
    return currentValue === normalized ? identity : null;
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

  private assertRequiredMatch(
    ifMatch: string | undefined,
    kind: string,
    revision: number,
  ) {
    const parsed = parseIfMatch(ifMatch);
    if (!parsed || parsed.kind !== kind || parsed.revision !== revision) {
      problem(412, 'PRECONDITION_FAILED');
    }
  }

  private async assertActiveMembership(subject: string, profileId: string) {
    const membership = await this.memberships.findOne({
      subject,
      profileId,
      status: 'active',
    });
    if (!membershipIsEffective(membership)) problem(404, 'NOT_FOUND');
    return membership;
  }

  private async assertActiveOwner(subject: string, profileId: string) {
    const membership = await this.memberships.findOne({
      subject,
      profileId,
      role: 'owner',
      status: 'active',
    });
    if (!membershipIsEffective(membership)) problem(404, 'NOT_FOUND');
    return membership;
  }

  private async ownerContextRevision(profileId: string): Promise<number> {
    const owner = await this.memberships.findOne({
      profileId,
      role: 'owner',
      status: 'active',
    });
    if (!owner) return 0;
    const identity = await this.identityModel.findOne({
      subject: owner.subject,
    });
    return identity?.contextRevision || 0;
  }

  private async identityWithMasks(identity: MstyleIdentityDocument) {
    const dto = safeIdentity(identity);
    dto.contactMasks = await this.contactMasks(identity.subject);
    return dto;
  }

  private async contactMasks(subject: string) {
    const rows = await this.contacts
      .find({ subject })
      .sort({ revision: -1 })
      .lean();
    const masks = new Map<'phone' | 'email', string>();
    for (const row of rows) {
      const type = row.type as 'phone' | 'email';
      if (!masks.has(type) && row.masked) masks.set(type, row.masked);
    }
    return [...masks].map(([type, masked]) => ({ type, masked }));
  }

  private async profileContactMasks(profileId: string) {
    const assigns = await this.assignments.find({ profileId }).lean();
    return assigns.map((a) => ({
      type: a.contactType as 'phone' | 'email',
      masked: a.contactMask,
    }));
  }

  private async bumpMembershipContexts(
    profileId: string,
    affectedSubject: string,
  ) {
    const members = await this.memberships.find({
      profileId,
      status: 'active',
    });
    const subjects = new Set([
      affectedSubject,
      ...members.map((member) => member.subject),
    ]);
    const revisions: { subject: string; contextRevision: number }[] = [];
    for (const subject of subjects) {
      const updated = await this.identityModel.findOneAndUpdate(
        { subject },
        { $inc: { contextRevision: 1 } },
        { returnDocument: 'after' },
      );
      if (updated)
        revisions.push({ subject, contextRevision: updated.contextRevision });
    }
    return revisions;
  }

  private async bumpMembersContext(
    profileId: string,
    preferredSubject?: string,
  ): Promise<number> {
    const members = await this.memberships
      .find({ profileId, status: 'active' })
      .lean();
    let last = 0;
    let ownerRevision: number | undefined;
    let preferredRevision: number | undefined;
    for (const member of members) {
      const identity = await this.identityModel.findOne({
        subject: member.subject,
      });
      if (!identity) continue;
      identity.contextRevision += 1;
      await identity.save();
      last = identity.contextRevision;
      if (member.role === 'owner') ownerRevision = identity.contextRevision;
      if (member.subject === preferredSubject) {
        preferredRevision = identity.contextRevision;
      }
    }
    return preferredRevision ?? ownerRevision ?? last;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function encodeListCursor(
  updatedAt: unknown,
  id: string,
  direction: 1 | -1,
  context: string,
  secret: string,
): string {
  const date =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : typeof updatedAt === 'string'
        ? updatedAt
        : nowIso();
  const payload = Buffer.from(
    JSON.stringify({ v: 1, date, id, direction, context }),
  ).toString('base64url');
  return `${payload}.${hmacHex(secret, `mstyle-profile-search:${payload}`)}`;
}

function decodeListCursor(
  raw: string | null | undefined,
  direction: 1 | -1,
  context: string,
  secret: string,
): { updatedAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const [payload, signature, extra] = raw.split('.');
    if (
      !payload ||
      !signature ||
      extra ||
      !safeEqualHex(
        signature,
        hmacHex(secret, `mstyle-profile-search:${payload}`),
      )
    ) {
      problem(422, 'INVALID_CURSOR');
    }
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {
      v?: number;
      date?: string;
      id?: string;
      direction?: number;
      context?: string;
    };
    if (
      value.v !== 1 ||
      !value.date ||
      !value.id ||
      value.direction !== direction ||
      value.context !== context ||
      !Number.isFinite(Date.parse(value.date))
    ) {
      problem(422, 'INVALID_CURSOR');
    }
    return { updatedAt: value.date, id: value.id };
  } catch {
    problem(422, 'INVALID_CURSOR');
  }
}

function profileSearchCursorContext(
  cfg: MstyleV2Config,
  dto: SearchProfilesDto,
  direction: 1 | -1,
): string {
  return hmacHex(
    cfg.idempotencySecret(),
    JSON.stringify({
      query: dto.query
        ? { type: dto.query.type, value: dto.query.value }
        : null,
      profileIds: dto.filters?.profileIds
        ? [...dto.filters.profileIds].sort()
        : null,
      direction,
    }),
  );
}

function leafFieldCodes(value: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Object.keys(item as Record<string, unknown>).length
    ) {
      out.push(...leafFieldCodes(item as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function mergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function privateDataIsComplete(
  data: Record<string, unknown>,
  profileType: 'individual' | 'company',
  legalForm?: 'ip' | 'ooo' | null,
): boolean {
  if (profileType === 'company') {
    const required =
      legalForm === 'ip' ? ['inn', 'ogrnip'] : ['fullName', 'inn', 'ogrn'];
    return required.every((field) => hasPrivateInputValue(data, field));
  }
  return (
    hasPrivateInputValue(data, 'birthDate') &&
    (hasPrivateInputValue(data, 'fullName') ||
      hasValueAtPath(data, 'passport.fullName') ||
      hasValueAtPath(data, 'individual.passport.fullName'))
  );
}

function hasValueAtPath(data: Record<string, unknown>, path: string): boolean {
  let value: unknown = data;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    value = (value as Record<string, unknown>)[part];
  }
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function hasPrivateInputValue(
  data: Record<string, unknown>,
  field: string,
): boolean {
  const direct = data[field];
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return true;
  }
  for (const root of ['company', 'entrepreneur', 'individual']) {
    const value = data[root];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>)[field] !== undefined &&
      (value as Record<string, unknown>)[field] !== null &&
      String((value as Record<string, unknown>)[field]).trim()
    ) {
      return true;
    }
  }
  return false;
}
