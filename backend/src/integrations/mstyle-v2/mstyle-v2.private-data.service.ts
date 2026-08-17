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
import { decryptJson, encryptJson, hmacHex } from './mstyle-v2.crypto';
import type {
  BindSnapshotDto,
  PatchPrivateDataDto,
  RevealDto,
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
    const required =
      profile.type === 'company'
        ? REQUIRED_COMPANY_FIELDS
        : REQUIRED_INDIVIDUAL_FIELDS;
    const missing = required.filter((field) => !hasValue(values[field]));
    return new MstyleResult(
      privateStatusDto(
        'resident_profile',
        profileId,
        profile.type as 'individual' | 'company',
        profile.legalForm,
        doc,
        missing,
      ),
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
    const values = pick(stored, dto.fieldCodes);
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
    );
  }

  async patchResident(profileId: string, dto: PatchPrivateDataDto) {
    const profile = await this.requireProfile(profileId);
    this.assertFields(Object.keys(dto.values), RESIDENT_PRIVATE_FIELDS);
    let doc = await this.privateData.findOne({
      partyType: 'resident_profile',
      partyId: profileId,
    });
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = { ...current, ...dto.values };
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
    const required =
      profile.type === 'company'
        ? REQUIRED_COMPANY_FIELDS
        : REQUIRED_INDIVIDUAL_FIELDS;
    const missing = required.filter((field) => !hasValue(merged[field]));
    profile.privateDataRevision = doc.revision;
    profile.privateDataComplete = missing.length === 0;
    await profile.save();
    const eventIds = [
      await this.events.emit({
        type: 'private_data.updated',
        aggregate: { type: 'profile', id: profileId },
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
    const payload = { values, contacts, sourceRevisions };
    const digestValue = hmacHex(this.cfg.piiSecret(), JSON.stringify(payload));
    const eventIds = [
      await this.events.emit({
        type: 'private_data.snapshot_created',
        aggregate: { type: 'profile', id: profileId },
        profileId,
      }),
    ];
    const snapshot = await this.snapshots.create({
      snapshotId: Ids.snapshot(),
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

  async revealProfileContacts(profileId: string) {
    const profile = await this.requireProfile(profileId);
    const values = await this.revealProfileContactsValues(profileId);
    return new MstyleResult(
      schema({
        partyType: 'resident_profile',
        partyId: profileId,
        sourceRevisions: await this.residentSourceRevisions(profile),
        values,
      }),
    );
  }

  async revealSnapshot(snapshotId: string, dto: RevealDto) {
    const snapshot = await this.requireSnapshot(snapshotId);
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
    );
  }

  async revealSnapshotContacts(snapshotId: string) {
    const snapshot = await this.requireSnapshot(snapshotId);
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
        values: payload.contacts || {},
      }),
    );
  }

  async bindSnapshot(snapshotId: string, dto: BindSnapshotDto) {
    const snapshot = await this.requireSnapshot(snapshotId);
    const existing = await this.bindings.findOne({
      snapshotId,
      operationRef: dto.operationRef,
    });
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
    const eventIds = [
      await this.events.emit({
        type: 'snapshot.bound',
        aggregate: { type: 'snapshot', id: snapshotId },
        profileId:
          snapshot.partyType === 'resident_profile'
            ? snapshot.partyId
            : undefined,
        guestPartyId:
          snapshot.partyType === 'guest_party' ? snapshot.partyId : undefined,
        payload: { operationRef: dto.operationRef },
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
    const missing = REQUIRED_GUEST_FIELDS.filter(
      (field) => !hasValue(values[field]),
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
    );
  }

  async revealGuest(guestPartyId: string, dto: RevealDto) {
    await this.requireGuest(guestPartyId);
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
        sourceRevisions: await this.guestSourceRevisions(guestPartyId),
        values: pick(stored, dto.fieldCodes),
      }),
    );
  }

  async patchGuest(guestPartyId: string, dto: PatchPrivateDataDto) {
    const guest = await this.requireGuest(guestPartyId);
    this.assertFields(Object.keys(dto.values), GUEST_PRIVATE_FIELDS);
    let doc = await this.privateData.findOne({
      partyType: 'guest_party',
      partyId: guestPartyId,
    });
    const current = doc
      ? decryptJson<Record<string, unknown>>(
          this.cfg.piiSecret(),
          doc.valuesEnc,
        )
      : {};
    const merged = { ...current, ...dto.values };
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
    const missing = REQUIRED_GUEST_FIELDS.filter(
      (field) => !hasValue(merged[field]),
    );
    guest.privateDataRevision = doc.revision;
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest.private_data.updated',
        aggregate: { type: 'guest_party', id: guestPartyId },
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
    const payload = { values, contacts, sourceRevisions };
    const eventIds = [
      await this.events.emit({
        type: 'guest.snapshot_created',
        aggregate: { type: 'guest_party', id: guestPartyId },
        guestPartyId,
      }),
    ];
    const snapshot = await this.snapshots.create({
      snapshotId: Ids.snapshot(),
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

  async revealGuestContacts(guestPartyId: string) {
    await this.requireGuest(guestPartyId);
    return new MstyleResult(
      schema({
        guestPartyId,
        sourceRevisions: {
          guestContacts: await this.guestContactRevisions(guestPartyId),
        },
        values: await this.guestContactValues(guestPartyId),
      }),
    );
  }

  private async residentSourceRevisions(profile: MstyleProfileDocument) {
    const assigns = await this.assignments.find({
      profileId: profile.profileId,
    });
    const phone = assigns.find((a) => a.contactType === 'phone');
    const email = assigns.find((a) => a.contactType === 'email');
    const phoneContact = phone
      ? await this.contacts.findOne({ contactId: phone.contactId })
      : null;
    const emailContact = email
      ? await this.contacts.findOne({ contactId: email.contactId })
      : null;
    const ownerAssign = assigns[0];
    const identity = ownerAssign
      ? await this.identities.findOne({ subject: ownerAssign.subject })
      : null;
    const identityPhone = identity
      ? await this.contacts.findOne({
          subject: identity.subject,
          type: 'phone',
        })
      : null;
    const identityEmail = identity
      ? await this.contacts.findOne({
          subject: identity.subject,
          type: 'email',
        })
      : null;
    return {
      profile: profile.revision,
      profileContactAssignments: {
        phone: phoneContact?.revision ?? null,
        email: emailContact?.revision ?? null,
      },
      contactIdentity: identity?.revision ?? null,
      identityContacts: {
        phone: identityPhone?.revision ?? null,
        email: identityEmail?.revision ?? null,
      },
      privateData: profile.privateDataRevision ?? 0,
    };
  }

  private async revealProfileContactsValues(profileId: string) {
    const assigns = await this.assignments.find({
      profileId,
      status: 'active',
    });
    const values: { displayName?: string; phone?: string; email?: string } = {};
    for (const assign of assigns) {
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
      if (identity?.displayName) values.displayName = identity.displayName;
    }
    return values;
  }

  private async guestSourceRevisions(guestPartyId: string) {
    const guest = await this.requireGuest(guestPartyId);
    return {
      guestParty: guest.revision,
      guestContacts: await this.guestContactRevisions(guestPartyId),
      privateData: guest.privateDataRevision ?? 0,
    };
  }

  private async guestContactRevisions(guestPartyId: string) {
    const phone = await this.guestContacts.findOne({
      guestPartyId,
      type: 'phone',
    });
    const email = await this.guestContacts.findOne({
      guestPartyId,
      type: 'email',
    });
    return {
      phone: phone?.revision ?? null,
      email: email?.revision ?? null,
    };
  }

  private async guestContactValues(guestPartyId: string) {
    const rows = await this.guestContacts.find({ guestPartyId });
    const values: { phone?: string; email?: string } = {};
    for (const row of rows) {
      const raw = decryptJson<string>(this.cfg.piiSecret(), row.valueEnc);
      if (row.type === 'phone') values.phone = raw;
      if (row.type === 'email') values.email = raw;
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
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function pick(source: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) out[key] = source[key];
  }
  return out;
}
