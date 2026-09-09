import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GUEST_PRIVATE_FIELDS,
  REQUIRED_COMPANY_FIELDS,
  REQUIRED_GUEST_FIELDS,
  REQUIRED_INDIVIDUAL_FIELDS,
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
  PatchPrivateDataDto,
  ProfileContactsRevealDto,
  RevealDto,
  SnapshotContactsRevealDto,
  SnapshotRevealDto,
} from './mstyle-v2.dto';
import { MstyleEventsService } from './mstyle-v2.events';
import { Ids } from './mstyle-v2.ids';
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

  async revealResident(profileId: string, dto: RevealDto) {
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
        sourceRevisions: await this.residentSourceRevisions(profile),
        values,
      }),
      200,
      { 'Cache-Control': 'no-store, private' },
    );
  }

  async patchResident(
    profileId: string,
    dto: PatchPrivateDataDto,
    ifMatch?: string,
  ) {
    const profile = await this.requireProfile(profileId);
    this.assertFields(leafFieldCodes(dto.values), RESIDENT_PRIVATE_FIELDS);
    let doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    this.assertMatch(ifMatch, 'private', doc?.revision ?? 0);
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = mergeObjects(current, dto.values);
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
        contextRevision: profile.revision,
        eventIds,
      }),
      200,
      { ETag: etag('private', doc.revision), 'Cache-Control': 'no-store' },
    );
  }

  async snapshotResident(profileId: string) {
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
    const contacts = await this.revealProfileContactsValues(profileId);
    const sourceRevisions = await this.residentSourceRevisions(profile);
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
      if (!owner) problem(404, 'NOT_FOUND');
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
    await this.assertSnapshotOperation(snapshotId, dto.operationRef);
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
        snapshotId,
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
    await this.assertSnapshotOperation(snapshotId, dto.operationRef);
    this.assertFields(dto.fieldCodes, ['displayName', 'phone', 'email']);
    const payload = decryptJson<{
      contacts?: { displayName?: string; phone?: string; email?: string };
    }>(this.cfg.piiSecret(), snapshot.payloadEnc);
    return new MstyleResult(
      schema({
        snapshotId,
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
    const canonicalValues = canonicalPrivateValues(values, 'individual', null);
    const missing = REQUIRED_GUEST_FIELDS.filter(
      (field) => !hasValue(getPath(canonicalValues, field)),
    );
    return new MstyleResult(
      privateStatusDto(
        'guest_party',
        guestPartyId,
        'individual',
        null,
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
    this.assertFields(dto.fieldCodes, GUEST_PRIVATE_FIELDS);
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
          canonicalPrivateValues(stored, 'individual', null),
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
    this.assertFields(leafFieldCodes(dto.values), GUEST_PRIVATE_FIELDS);
    let doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    this.assertMatch(ifMatch, 'private', doc?.revision ?? 0);
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = mergeObjects(current, dto.values);
    if (!doc) {
      doc = await this.privateData.create({
        partyType: 'guest_party',
        partyId: guestPartyId,
        profileType: 'individual',
        legalForm: null,
        revision: 1,
        editPolicy: 'self_service',
        valuesEnc: encryptJson(this.cfg.piiSecret(), merged),
      });
    } else {
      doc.valuesEnc = encryptJson(this.cfg.piiSecret(), merged);
      doc.revision += 1;
      await doc.save();
    }
    const canonicalMerged = canonicalPrivateValues(merged, 'individual', null);
    const missing = REQUIRED_GUEST_FIELDS.filter(
      (field) => !hasValue(getPath(canonicalMerged, field)),
    );
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
          'individual',
          null,
          doc,
          missing,
        ),
        guestPartyRevision: guest.revision,
        eventIds,
      }),
      200,
      { ETag: etag('guest', guest.revision), 'Cache-Control': 'no-store' },
    );
  }

  async snapshotGuest(guestPartyId: string) {
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
    const contacts = await this.guestContactValues(guestPartyId);
    const sourceRevisions = await this.guestSourceRevisions(guestPartyId);
    const payload = {
      values: canonicalPrivateValues(values, 'individual', null),
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
    purpose?: string,
  ) {
    const assigns = await this.assignments
      .find({
        profileId: profile.profileId,
        status: 'active',
        ...(purpose ? { purpose } : {}),
      })
      .sort({ priority: 1, updatedAt: -1 });
    const phone = assigns.find((a) => a.contactType === 'phone');
    const email = assigns.find((a) => a.contactType === 'email');
    const ownerAssign = assigns[0];
    const identity = ownerAssign
      ? await this.identities.findOne({ subject: ownerAssign.subject })
      : null;
    const identityPhone = phone
      ? await this.contacts.findOne({ contactId: phone.contactId })
      : null;
    const identityEmail = email
      ? await this.contacts.findOne({ contactId: email.contactId })
      : null;
    return {
      profile: profile.revision,
      profileContactAssignments: {
        phone: phone?.revision ?? null,
        email: email?.revision ?? null,
      },
      contactIdentity: identity?.revision ?? null,
      identityContacts: {
        phone: identityPhone?.revision ?? null,
        email: identityEmail?.revision ?? null,
      },
      privateData: profile.privateDataRevision ?? null,
    };
  }

  private async revealProfileContactsValues(
    profileId: string,
    purpose?: string,
  ) {
    const assigns = await this.assignments
      .find({
        profileId,
        status: 'active',
        ...(purpose ? { purpose } : {}),
      })
      .sort({ priority: 1, updatedAt: -1 });
    const values: { displayName?: string; phone?: string; email?: string } = {};
    for (const assign of assigns) {
      if (assign.contactType === 'phone' && values.phone !== undefined) {
        continue;
      }
      if (assign.contactType === 'email' && values.email !== undefined) {
        continue;
      }
      const contact = await this.contacts.findOne({
        contactId: assign.contactId,
      });
      if (!contact) continue;
      const raw = decryptJson<string>(this.cfg.piiSecret(), contact.valueEnc);
      if (contact.type === 'phone') values.phone = raw;
      if (contact.type === 'email') values.email = raw;
      const identity = await this.identities.findOne({
        subject: assign.subject,
      });
      if (identity?.displayName && values.displayName === undefined) {
        values.displayName = identity.displayName;
      }
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
      })
      .sort({ updatedAt: -1, revision: -1 });
    const email = await this.guestContacts
      .findOne({
        guestPartyId,
        type: 'email',
      })
      .sort({ updatedAt: -1, revision: -1 });
    return {
      phone: phone?.revision ?? null,
      email: email?.revision ?? null,
    };
  }

  private async guestContactValues(guestPartyId: string) {
    const rows = await this.guestContacts
      .find({ guestPartyId })
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

  private async requireSnapshot(snapshotId: string) {
    const snapshot = await this.snapshots.findOne({ snapshotId });
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

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function pick(source: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = getPath(source, key);
    if (value !== undefined) setPath(out, key, value);
  }
  return out;
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const child = cursor[part];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function leafFieldCodes(
  source: Record<string, unknown>,
  prefix = '',
): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...leafFieldCodes(value as Record<string, unknown>, path));
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
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
        ? mergeObjects(
            current as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return merged;
}

function requiredResidentFields(
  profileType: string,
  legalForm?: string | null,
): readonly string[] {
  if (profileType !== 'company') return REQUIRED_INDIVIDUAL_FIELDS;
  return legalForm === 'ip'
    ? ['entrepreneur.inn', 'entrepreneur.ogrnip']
    : REQUIRED_COMPANY_FIELDS;
}

/**
 * M0 stored flat field names. M1/M2 expose structured field codes, so reads
 * project legacy rows into the canonical shape without rewriting history.
 */
function canonicalPrivateValues(
  source: Record<string, unknown>,
  profileType: string,
  legalForm?: string | null,
): Record<string, unknown> {
  const result = mergeObjects({}, source);
  if (profileType === 'company' && legalForm === 'ip') {
    copyAliases(result, source, 'entrepreneur', {
      inn: ['inn'],
      ogrnip: ['ogrnip', 'ogrn'],
      registrationAddress: ['registrationAddress', 'legalAddress'],
    });
  } else if (profileType === 'company') {
    copyAliases(result, source, 'company', {
      fullName: ['fullName', 'companyFullName'],
      inn: ['inn'],
      kpp: ['kpp'],
      ogrn: ['ogrn'],
      legalAddress: ['legalAddress'],
      actualAddress: ['actualAddress'],
      generalDirector: ['generalDirector', 'ceoName'],
    });
  } else {
    copyAliases(result, source, 'individual', {
      birthDate: ['birthDate'],
      inn: ['inn'],
      registrationAddress: ['registrationAddress'],
    });
    copyAliases(result, source, 'individual.passport', {
      fullName: ['fullName', 'displayName'],
      gender: ['gender'],
      birthDate: ['birthDate'],
      number: ['documentNumber'],
      departmentCode: ['documentCode'],
      issuedDate: ['documentIssuedAt'],
      issuedBy: ['documentIssuedBy'],
    });
  }
  return result;
}

function copyAliases(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  targetPrefix: string,
  aliases: Record<string, readonly string[]>,
) {
  for (const [name, candidates] of Object.entries(aliases)) {
    if (getPath(target, `${targetPrefix}.${name}`) !== undefined) continue;
    const candidate = candidates
      .map((path) => getPath(source, path))
      .find((value) => value !== undefined);
    if (candidate !== undefined) {
      setPath(target, `${targetPrefix}.${name}`, candidate);
    }
  }
}
