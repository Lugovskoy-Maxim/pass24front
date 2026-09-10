import { MstyleConsentService } from './mstyle-v2.consent.service';
import { guestWriteAllowed } from './mstyle-v2.guest-access';
import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { MstyleContactSelectionService } from './mstyle-v2.contact-selection';
import {
  hasValue,
  pick,
  getPath,
  mergeObjects,
  requiredResidentFields,
  canonicalPrivateValues,
  normalizeResidentInput,
  validateResidentValues,
} from './mstyle-v2.private-values';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GUEST_PRIVATE_FIELDS,
  RESIDENT_PRIVATE_FIELDS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  canonicalJson,
  decryptJson,
  encryptJson,
  hmacHex,
} from './mstyle-v2.crypto';
import type {
  BindSnapshotDto,
  CreateSnapshotDto,
  PatchPrivateDataDto,
  ResidentPatchPrivateDataDto,
  ResidentCreateSnapshotDto,
  ProfileContactsRevealDto,
  RevealDto,
  SnapshotContactsRevealDto,
  SnapshotRevealDto,
} from './mstyle-v2.dto';
import { MstyleEventsService } from './mstyle-v2.events';
import { Ids, publicSnapshotId, snapshotQuery } from './mstyle-v2.ids';
import {
  nowIso,
  privateStatusDto,
  schema,
  snapshotRef,
  etag,
} from './mstyle-v2.present';
import { MstyleResult, problem } from './mstyle-v2.problem';
import {
  MstyleContact,
  MstyleContactAssignment,
  MstyleContactAssignmentDocument,
  MstyleContactDocument,
  MstyleGuestContact,
  MstyleGuestContactDocument,
  MstyleGuestParty,
  MstyleGuestPartyDocument,
  MstyleIdentity,
  MstyleIdentityDocument,
  MstyleMembership,
  MstyleMembershipDocument,
  MstylePrivateData,
  MstylePrivateDataDocument,
  MstyleProfile,
  MstyleProfileDocument,
  MstyleSnapshot,
  MstyleSnapshotBinding,
  MstyleSnapshotBindingDocument,
  MstyleSnapshotDocument,
} from './mstyle-v2.schemas';

@Injectable()
export class MstylePrivateDataService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly events: MstyleEventsService,
    @InjectModel(MstyleProfile.name)
    private readonly profiles: Model<MstyleProfileDocument>,
    @InjectModel(MstylePrivateData.name)
    private readonly privateData: Model<MstylePrivateDataDocument>,
    @InjectModel(MstyleSnapshot.name)
    private readonly snapshots: Model<MstyleSnapshotDocument>,
    @InjectModel(MstyleSnapshotBinding.name)
    private readonly bindings: Model<MstyleSnapshotBindingDocument>,
    @InjectModel(MstyleContact.name)
    private readonly contacts: Model<MstyleContactDocument>,
    @InjectModel(MstyleContactAssignment.name)
    private readonly assignments: Model<MstyleContactAssignmentDocument>,
    @InjectModel(MstyleIdentity.name)
    private readonly identities: Model<MstyleIdentityDocument>,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembershipDocument>,
    @InjectModel(MstyleGuestParty.name)
    private readonly guests: Model<MstyleGuestPartyDocument>,
    @InjectModel(MstyleGuestContact.name)
    private readonly guestContacts: Model<MstyleGuestContactDocument>,
    private readonly contactSelection: MstyleContactSelectionService,
    private readonly consentService: MstyleConsentService,
  ) {}

  async residentStatus(profileId: string) {
    const profile = await this.requireProfile(profileId);
    const doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    const values = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const canonicalValues = canonicalPrivateValues(
      values,
      profile.type,
      profile.legalForm,
    );
    const required = requiredResidentFields(profile.type, profile.legalForm);
    const missing = required.filter(
      (field) => !hasValue(getPath(canonicalValues, field)),
    );
    return new MstyleResult(
      privateStatusDto(
        'resident_profile',
        profileId,
        profile.type as 'individual' | 'company',
        profile.legalForm,
        doc,
        missing,
      ),
      200,
      {
        ETag: etag('private', doc?.revision ?? 0),
        'Cache-Control': 'no-store',
      },
    );
  }

  async revealResident(
    profileId: string,
    dto: RevealDto,
    residentSubject: string,
  ) {
    if (!residentSubject) problem(404, 'NOT_FOUND');
    const owner = await this.memberships.findOne({
      profileId,
      subject: residentSubject,
      role: 'owner',
    });
    if (!membershipIsEffective(owner)) problem(404, 'NOT_FOUND');
    const profile = await this.requireProfile(profileId);
    this.assertFields(dto.fieldCodes, RESIDENT_PRIVATE_FIELDS);
    const doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    const stored = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const values = pick(
      canonicalPrivateValues(stored, profile.type, profile.legalForm),
      dto.fieldCodes,
    );
    return new MstyleResult(
      schema({
        partyType: 'resident_profile',
        partyId: profileId,
        profileType: profile.type,
        legalForm: profile.legalForm,
        revision: doc?.revision ?? 0,
        sourceRevisions: {
          profile: profile.revision,
          privateData: doc?.revision ?? 0,
        },
        values,
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async patchResident(
    profileId: string,
    dto: ResidentPatchPrivateDataDto,
    ifMatch?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    if (
      dto.privateData.profileType !== profile.type ||
      (dto.privateData.legalForm ?? null) !== profile.legalForm
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
    let doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    if (!ifMatch) problem(412, 'PRECONDITION_FAILED');
    this.assertMatch(ifMatch, 'private', doc?.revision ?? 0);
    if (doc && !['initial', 'self_service'].includes(doc.editPolicy))
      problem(409, 'CONFLICT', {
        title: 'Private data requires a change request',
      });
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = validateResidentValues(
      mergeObjects(
        normalizeResidentInput(current, profile.type, profile.legalForm),
        patch,
      ),
      profile.type,
      profile.legalForm,
    );
    if (!doc) {
      doc = await this.privateData.create({
        partyType: 'resident_profile',
        partyId: profileId,
        profileType: profile.type,
        legalForm: profile.legalForm,
        revision: 1,
        editPolicy: 'self_service',
        valuesEnc: encryptJson(this.cfg.piiSecret(), merged),
      });
    } else {
      doc.valuesEnc = encryptJson(this.cfg.piiSecret(), merged);
      doc.revision += 1;
      doc.editPolicy = 'self_service';
      await doc.save();
    }
    const canonicalMerged = canonicalPrivateValues(
      merged,
      profile.type,
      profile.legalForm,
    );
    const required = requiredResidentFields(profile.type, profile.legalForm);
    const missing = required.filter(
      (field) => !hasValue(getPath(canonicalMerged, field)),
    );
    profile.privateDataRevision = doc.revision;
    profile.privateDataComplete = missing.length === 0;
    await profile.save();
    const contextRevision = await this.bumpMemberContexts(profileId);
    const eventIds = [
      await this.events.emit({
        type: 'resident_private_data.updated',
        aggregate: {
          type: 'resident_private_data',
          id: profileId,
          revision: doc.revision,
        },
        profileId,
      }),
    ];
    return new MstyleResult(
      schema({
        status: privateStatusDto(
          'resident_profile',
          profileId,
          profile.type as 'individual' | 'company',
          profile.legalForm,
          doc,
          missing,
        ),
        contextRevision,
        eventIds,
      }),
      200,
      { ETag: etag('private', doc.revision), 'Cache-Control': 'no-store' },
    );
  }

  async snapshotResident(profileId: string, dto: ResidentCreateSnapshotDto) {
    const profile = await this.requireProfile(profileId);
    const doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    const values = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const canonical = canonicalPrivateValues(
      values,
      profile.type,
      profile.legalForm,
    );
    if (
      !doc ||
      !profile.privateDataComplete ||
      requiredResidentFields(profile.type, profile.legalForm).some(
        (field) => !hasValue(getPath(canonical, field)),
      )
    ) {
      problem(409, 'CONFLICT', { title: 'Private data is incomplete' });
    }
    const contacts = await this.revealProfileContactsValues(
      profileId,
      dto.contactPurpose,
    );
    if (!contacts.phone && !contacts.email)
      problem(409, 'CONFLICT', {
        title: 'Verified primary contact is required',
      });
    const sourceRevisions = await this.residentSourceRevisions(
      profile,
      dto.contactPurpose,
    );
    if (
      canonicalJson(sourceRevisions) !==
      canonicalJson(dto.expectedSourceRevisions)
    )
      problem(412, 'PRECONDITION_FAILED');
    const payload = {
      values: canonicalPrivateValues(values, profile.type, profile.legalForm),
      contacts,
      sourceRevisions,
    };
    const digestValue = hmacHex(this.cfg.piiSecret(), JSON.stringify(payload));
    const snapshotId = Ids.snapshot();
    const eventIds = [
      await this.events.emit({
        type: 'resident_snapshot.created',
        aggregate: {
          type: 'resident_snapshot',
          id: snapshotId,
          revision: 1,
        },
        profileId,
      }),
    ];
    const snapshot = await this.snapshots.create({
      snapshotId,
      partyType: 'resident_profile',
      partyId: profileId,
      snapshotRevision: 1,
      contentDigest: {
        algorithm: 'HMAC-SHA-256',
        keyVersion: 1,
        value: digestValue,
      },
      eventIds,
      sourceRevisions,
      payloadEnc: encryptJson(this.cfg.piiSecret(), payload),
      createdAtIso: nowIso(),
    });
    return new MstyleResult(snapshotRef(snapshot), 201);
  }

  async revealProfileContacts(
    profileId: string,
    dto: ProfileContactsRevealDto,
    residentSubject?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    if (residentSubject) {
      const owner = await this.memberships.findOne({
        profileId,
        subject: residentSubject,
        role: 'owner',
        status: 'active',
      });
      if (!membershipIsEffective(owner)) problem(404, 'NOT_FOUND');
    }
    this.assertFields(dto.fieldCodes, ['displayName', 'phone', 'email']);
    const values = pick(
      await this.revealProfileContactsValues(profileId, dto.contactPurpose),
      dto.fieldCodes,
    );
    const sourceRevisions = await this.residentSourceRevisions(
      profile,
      dto.contactPurpose,
    );
    return new MstyleResult(
      schema({
        partyType: 'resident_profile',
        partyId: profileId,
        sourceRevisions: {
          profileContactAssignments: sourceRevisions.profileContactAssignments,
          contactIdentity: sourceRevisions.contactIdentity,
          identityContacts: sourceRevisions.identityContacts,
        },
        values,
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async revealSnapshot(
    snapshotId: string,
    dto: SnapshotRevealDto,
    scopes: readonly string[],
  ) {
    const snapshot = await this.requireSnapshot(snapshotId);
    this.assertSnapshotScope(snapshot, scopes, 'private');
    await this.assertSnapshotOperation(snapshot.snapshotId, dto.operationRef);
    const payload = decryptJson<{ values: Record<string, unknown> }>(
      this.cfg.piiSecret(),
      snapshot.payloadEnc,
    );
    const allowed =
      snapshot.partyType === 'guest_party'
        ? GUEST_PRIVATE_FIELDS
        : RESIDENT_PRIVATE_FIELDS;
    this.assertFields(dto.fieldCodes, allowed);
    return new MstyleResult(
      schema({
        snapshotId: publicSnapshotId(snapshot.snapshotId, snapshot.partyType),
        partyType: snapshot.partyType,
        partyId: snapshot.partyId,
        snapshotRevision: snapshot.snapshotRevision,
        sourceRevisions: snapshot.sourceRevisions,
        values: pick(payload.values || {}, dto.fieldCodes),
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async revealSnapshotContacts(
    snapshotId: string,
    dto: SnapshotContactsRevealDto,
    scopes: readonly string[],
  ) {
    const snapshot = await this.requireSnapshot(snapshotId);
    this.assertSnapshotScope(snapshot, scopes, 'contact');
    await this.assertSnapshotOperation(snapshot.snapshotId, dto.operationRef);
    this.assertFields(dto.fieldCodes, ['displayName', 'phone', 'email']);
    const payload = decryptJson<{
      contacts?: { displayName?: string; phone?: string; email?: string };
    }>(this.cfg.piiSecret(), snapshot.payloadEnc);
    return new MstyleResult(
      schema({
        snapshotId: publicSnapshotId(snapshot.snapshotId, snapshot.partyType),
        partyType: snapshot.partyType,
        partyId: snapshot.partyId,
        snapshotRevision: snapshot.snapshotRevision,
        sourceRevisions: snapshot.sourceRevisions,
        values: pick(payload.contacts || {}, dto.fieldCodes),
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async bindSnapshot(snapshotId: string, dto: BindSnapshotDto) {
    const snapshot = await this.requireSnapshot(snapshotId);
    snapshotId = snapshot.snapshotId;
    const existingRows = await this.bindings.find({ snapshotId });
    const requestedRef = canonicalJson(dto.operationRef);
    const existing = existingRows.find(
      (row) => canonicalJson(row.operationRef) === requestedRef,
    );
    if (existing) {
      return new MstyleResult(
        schema({
          bindingId: existing.bindingId,
          bindingRevision: existing.bindingRevision,
          snapshotId,
          operationRef: dto.operationRef,
          status: 'bound',
          boundAt: existing.boundAt,
          eventIds: [],
        }),
      );
    }
    if (existingRows.length) {
      problem(409, 'CONFLICT', {
        title: 'Snapshot is already bound to another operation',
      });
    }
    const operationBinding = await this.bindings.findOne({
      'operationRef.sourceSystem': dto.operationRef.sourceSystem,
      'operationRef.environment': dto.operationRef.environment,
      'operationRef.operationType': dto.operationRef.operationType,
      'operationRef.operationId': dto.operationRef.operationId,
    });
    if (operationBinding)
      problem(409, 'CONFLICT', { title: 'Operation already has a snapshot' });
    const eventIds = [
      await this.events.emit({
        type: 'snapshot.operation_bound',
        aggregate: {
          type: 'snapshot_operation_binding',
          id: snapshotId,
          revision: 1,
        },
        profileId:
          snapshot.partyType === 'resident_profile'
            ? snapshot.partyId
            : undefined,
        guestPartyId:
          snapshot.partyType === 'guest_party' ? snapshot.partyId : undefined,
        payload: { snapshotId, operationRef: dto.operationRef },
      }),
    ];
    const row = await this.bindings.create({
      bindingId: Ids.binding(),
      snapshotId,
      operationRef: dto.operationRef,
      bindingRevision: 1,
      status: 'bound',
      boundAt: nowIso(),
    });
    return new MstyleResult(
      schema({
        bindingId: row.bindingId,
        bindingRevision: 1,
        snapshotId,
        operationRef: dto.operationRef,
        status: 'bound',
        boundAt: row.boundAt,
        eventIds,
      }),
    );
  }

  async guestStatus(guestPartyId: string) {
    await this.requireGuest(guestPartyId);
    const doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    const values = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const canonicalValues = canonicalPrivateValues(
      values,
      doc?.profileType || 'individual',
      doc?.legalForm,
    );
    const missing = requiredResidentFields(
      doc?.profileType || 'individual',
      doc?.legalForm,
    ).filter((field) => !hasValue(getPath(canonicalValues, field)));
    return new MstyleResult(
      privateStatusDto(
        'guest_party',
        guestPartyId,
        (doc?.profileType || 'individual') as 'individual' | 'company',
        doc?.legalForm,
        doc,
        missing,
      ),
      200,
      {
        ETag: etag('private', doc?.revision ?? 0),
        'Cache-Control': 'no-store',
      },
    );
  }

  async revealGuest(guestPartyId: string, dto: RevealDto) {
    const guest = await this.requireGuest(guestPartyId);
    this.assertFields(dto.fieldCodes, RESIDENT_PRIVATE_FIELDS);
    const doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    const stored = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    return new MstyleResult(
      schema({
        partyType: 'guest_party',
        partyId: guestPartyId,
        revision: doc?.revision ?? 0,
        sourceRevisions: {
          guestParty: guest.revision,
          privateData: doc?.revision ?? null,
        },
        values: pick(
          canonicalPrivateValues(
            stored,
            doc?.profileType || 'individual',
            doc?.legalForm,
          ),
          dto.fieldCodes,
        ),
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async patchGuest(
    guestPartyId: string,
    dto: PatchPrivateDataDto,
    ifMatch?: string,
  ) {
    const guest = await this.requireGuest(guestPartyId);
    if (!guestWriteAllowed(guest.status) || guest.status === 'draft')
      problem(409, 'CONFLICT');
    if ((!dto.privateData && !dto.values) || (dto.privateData && dto.values))
      problem(422, 'VALIDATION_FAILED');
    let doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    if (!ifMatch) problem(412, 'PRECONDITION_FAILED');
    this.assertMatch(ifMatch, 'private', doc?.revision ?? 0);
    const profileType =
      dto.privateData?.profileType || doc?.profileType || 'individual';
    const legalForm = dto.privateData?.legalForm ?? doc?.legalForm ?? null;
    if (
      (profileType === 'company' && !['ip', 'ooo'].includes(legalForm || '')) ||
      (profileType === 'individual' && legalForm !== null)
    )
      problem(422, 'VALIDATION_FAILED');
    if (
      doc &&
      (doc.profileType !== profileType || (doc.legalForm ?? null) !== legalForm)
    )
      problem(409, 'CONFLICT');
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = validateResidentValues(
      mergeObjects(
        normalizeResidentInput(current, profileType, legalForm),
        normalizeResidentInput(
          dto.privateData?.data || dto.values!,
          profileType,
          legalForm,
        ),
      ),
      profileType,
      legalForm,
    );
    if (!doc) {
      doc = await this.privateData.create({
        partyType: 'guest_party',
        partyId: guestPartyId,
        profileType,
        legalForm,
        revision: 1,
        editPolicy: 'self_service',
        valuesEnc: encryptJson(this.cfg.piiSecret(), merged),
      });
    } else {
      doc.valuesEnc = encryptJson(this.cfg.piiSecret(), merged);
      doc.revision += 1;
      await doc.save();
    }
    const canonicalMerged = canonicalPrivateValues(
      merged,
      profileType,
      legalForm,
    );
    const missing = requiredResidentFields(
      doc?.profileType || 'individual',
      doc?.legalForm,
    ).filter((field) => !hasValue(getPath(canonicalMerged, field)));
    if (dto.displayName !== undefined)
      guest.displayName = dto.displayName.trim();
    guest.privateDataRevision = doc.revision;
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest_private_data.updated',
        aggregate: {
          type: 'guest_private_data',
          id: guestPartyId,
          revision: doc.revision,
        },
        guestPartyId,
      }),
    ];
    return new MstyleResult(
      schema({
        status: privateStatusDto(
          'guest_party',
          guestPartyId,
          profileType as 'individual' | 'company',
          legalForm,
          doc,
          missing,
        ),
        guestPartyRevision: guest.revision,
        eventIds,
      }),
      200,
      { ETag: etag('private', doc.revision), 'Cache-Control': 'no-store' },
    );
  }

  async snapshotGuest(guestPartyId: string, dto: CreateSnapshotDto) {
    await this.consentService.assertAccepted('guest', guestPartyId);
    const guest = await this.requireGuest(guestPartyId);
    if (!guestWriteAllowed(guest.status) || !guest.primaryContact?.verifiedAt)
      problem(409, 'CONFLICT');
    const doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    const values = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const contacts = await this.guestContactValues(guestPartyId);
    const sourceRevisions = await this.guestSourceRevisions(guestPartyId);
    if (
      canonicalJson(dto.expectedSourceRevisions) !==
      canonicalJson(sourceRevisions)
    )
      problem(412, 'PRECONDITION_FAILED');
    const canonicalValues = canonicalPrivateValues(
      values,
      doc?.profileType || 'individual',
      doc?.legalForm,
    );
    if (
      !doc ||
      requiredResidentFields(doc.profileType, doc.legalForm).some(
        (field) => !hasValue(getPath(canonicalValues, field)),
      )
    )
      problem(409, 'CONFLICT');
    const payload = {
      values: canonicalPrivateValues(
        values,
        doc?.profileType || 'individual',
        doc?.legalForm,
      ),
      contacts,
      sourceRevisions,
    };
    const snapshotId = Ids.snapshot();
    const eventIds = [
      await this.events.emit({
        type: 'guest_snapshot.created',
        aggregate: {
          type: 'guest_snapshot',
          id: snapshotId,
          revision: 1,
        },
        guestPartyId,
      }),
    ];
    const snapshot = await this.snapshots.create({
      snapshotId,
      partyType: 'guest_party',
      partyId: guestPartyId,
      snapshotRevision: 1,
      contentDigest: {
        algorithm: 'HMAC-SHA-256',
        keyVersion: 1,
        value: hmacHex(this.cfg.piiSecret(), JSON.stringify(payload)),
      },
      eventIds,
      sourceRevisions,
      payloadEnc: encryptJson(this.cfg.piiSecret(), payload),
      createdAtIso: nowIso(),
    });
    return new MstyleResult(snapshotRef(snapshot), 201);
  }

  async revealGuestContacts(guestPartyId: string, dto: RevealDto) {
    await this.requireGuest(guestPartyId);
    this.assertFields(dto.fieldCodes, ['phone', 'email']);
    return new MstyleResult(
      schema({
        guestPartyId,
        sourceRevisions: {
          guestContacts: await this.guestContactRevisions(guestPartyId),
        },
        values: pick(
          await this.guestContactValues(guestPartyId),
          dto.fieldCodes,
        ),
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  private async residentSourceRevisions(
    profile: MstyleProfileDocument,
    purpose = 'primary',
  ) {
    const selected = await this.contactSelection.select(
      profile.profileId,
      purpose,
    );
    return {
      profile: profile.revision,
      ...selected.sourceRevisions,
      privateData: profile.privateDataRevision ?? null,
    };
  }

  private async revealProfileContactsValues(
    profileId: string,
    purpose = 'primary',
  ) {
    const selected = await this.contactSelection.select(profileId, purpose);
    const values: { displayName?: string; phone?: string; email?: string } = {};
    for (const type of ['phone', 'email'] as const) {
      const item = selected[type];
      if (!item) continue;
      values[type] = decryptJson<string>(
        this.cfg.piiSecret(),
        item.contact.valueEnc,
      );
      if (item.identity.displayName && values.displayName === undefined)
        values.displayName = item.identity.displayName;
    }
    return values;
  }

  private async guestSourceRevisions(guestPartyId: string) {
    const guest = await this.requireGuest(guestPartyId);
    return {
      guestParty: guest.revision,
      guestContacts: await this.guestContactRevisions(guestPartyId),
      privateData: guest.privateDataRevision ?? null,
    };
  }

  private async guestContactRevisions(guestPartyId: string) {
    const phone = await this.guestContacts
      .findOne({
        guestPartyId,
        type: 'phone',
        verifiedAt: { $ne: null },
      })
      .sort({ updatedAt: -1, revision: -1 });
    const email = await this.guestContacts
      .findOne({
        guestPartyId,
        type: 'email',
        verifiedAt: { $ne: null },
      })
      .sort({ updatedAt: -1, revision: -1 });
    return {
      phone: phone?.revision ?? null,
      email: email?.revision ?? null,
    };
  }

  private async guestContactValues(guestPartyId: string) {
    const rows = await this.guestContacts
      .find({ guestPartyId, verifiedAt: { $ne: null } })
      .sort({ updatedAt: -1, revision: -1 });
    const values: { phone?: string; email?: string } = {};
    for (const row of rows) {
      const raw = decryptJson<string>(this.cfg.piiSecret(), row.valueEnc);
      if (row.type === 'phone' && values.phone === undefined) {
        values.phone = raw;
      }
      if (row.type === 'email' && values.email === undefined) {
        values.email = raw;
      }
    }
    return values;
  }

  private async bumpMemberContexts(profileId: string): Promise<number> {
    const members = await this.memberships.find({
      profileId,
      status: 'active',
    });
    let ownerRevision = 0;
    for (const member of members) {
      const identity = await this.identities.findOneAndUpdate(
        { subject: member.subject },
        { $inc: { contextRevision: 1 } },
        { returnDocument: 'after' },
      );
      if (member.role === 'owner')
        ownerRevision = identity?.contextRevision || 0;
    }
    return ownerRevision;
  }

  private async requireProfile(profileId: string) {
    const profile = await this.profiles.findOne({ profileId });
    if (!profile) problem(404, 'NOT_FOUND');
    return profile;
  }

  private async requireGuest(guestPartyId: string) {
    const guest = await this.guests.findOne({ guestPartyId });
    if (!guest) problem(404, 'NOT_FOUND');
    return guest;
  }

  async requireSnapshot(snapshotId: string) {
    const snapshot = await this.snapshots.findOne(snapshotQuery(snapshotId));
    if (!snapshot) problem(404, 'NOT_FOUND');
    return snapshot;
  }

  private async assertSnapshotOperation(
    snapshotId: string,
    operationRef: unknown,
  ) {
    const rows = await this.bindings.find({ snapshotId });
    const expected = canonicalJson(operationRef);
    if (!rows.some((row) => canonicalJson(row.operationRef) === expected)) {
      problem(404, 'NOT_FOUND');
    }
  }

  private assertSnapshotScope(
    snapshot: MstyleSnapshotDocument,
    scopes: readonly string[],
    kind: 'private' | 'contact',
  ) {
    const side = snapshot.partyType === 'guest_party' ? 'guest' : 'resident';
    const required = `mstyle.${side}.snapshot.${kind}.reveal`;
    if (!scopes.includes(required)) problem(403, 'INSUFFICIENT_SCOPE');
  }

  private assertFields(fields: string[], allowed: readonly string[]) {
    const bad = fields.filter((field) => !allowed.includes(field));
    if (bad.length) {
      problem(422, 'VALIDATION_FAILED', {
        errors: bad.map((field) => ({
          field,
          code: 'unknown_field',
          message: 'Unknown fieldCode',
        })),
      });
    }
  }

  private assertMatch(
    ifMatch: string | undefined,
    kind: string,
    revision: number,
  ) {
    if (!ifMatch) return;
    const raw = ifMatch.replace(/^W\//, '').replace(/"/g, '').trim();
    const idx = raw.lastIndexOf('-');
    const parsedRevision = Number(raw.slice(idx + 1));
    if (
      idx < 1 ||
      raw.slice(0, idx) !== kind ||
      !Number.isFinite(parsedRevision) ||
      parsedRevision !== revision
    ) {
      problem(412, 'PRECONDITION_FAILED');
    }
  }
}
