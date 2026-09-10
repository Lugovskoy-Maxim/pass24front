import { MstyleConsentService } from './mstyle-v2.consent.service';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import { guestWriteAllowed } from './mstyle-v2.guest-access';
import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { MstyleContactProofService } from './mstyle-v2.contact-proof';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeRuMobilePhone } from '../../common/phone';
import { DEFAULT_GUEST_TTL_MS } from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  canonicalJson,
  decryptJson,
  encryptJson,
  hmacHex,
  maskContact,
  normalizeEmail,
  safeEqualHex,
  sha256Hex,
} from './mstyle-v2.crypto';
import type {
  ClaimGuestDto,
  ConfirmBookingDto,
  ConsentAcceptDto,
  ContactChallengeDto,
  ContactVerifyDto,
  CreateGuestDto,
  SearchGuestsDto,
} from './mstyle-v2.dto';
import { MstyleDirectoryService } from './mstyle-v2.directory.service';
import { MstyleEventsService } from './mstyle-v2.events';
import { Ids } from './mstyle-v2.ids';
import { MstyleIdentityService } from './mstyle-v2.identities';
import {
  contactDto,
  etag,
  guestStatusDto,
  nowIso,
  schema,
} from './mstyle-v2.present';
import { MstyleResult, problem } from './mstyle-v2.problem';
import {
  MstyleChallenge,
  MstyleChallengeDocument,
  MstyleConsent,
  MstyleConsentDocument,
  MstyleContact,
  MstyleContactDocument,
  MstyleGuestContact,
  MstyleGuestContactDocument,
  MstyleGuestParty,
  MstyleGuestPartyDocument,
  MstyleMembership,
  MstyleMembershipDocument,
  MstyleProfile,
  MstyleProfileDocument,
  MstyleSnapshot,
  MstyleSnapshotDocument,
} from './mstyle-v2.schemas';

@Injectable()
export class MstyleGuestsService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly events: MstyleEventsService,
    private readonly directory: MstyleDirectoryService,
    private readonly identities: MstyleIdentityService,
    @InjectModel(MstyleGuestParty.name)
    private readonly guests: Model<MstyleGuestPartyDocument>,
    @InjectModel(MstyleGuestContact.name)
    private readonly guestContacts: Model<MstyleGuestContactDocument>,
    @InjectModel(MstyleChallenge.name)
    private readonly challenges: Model<MstyleChallengeDocument>,
    @InjectModel(MstyleConsent.name)
    private readonly consents: Model<MstyleConsentDocument>,
    @InjectModel(MstyleSnapshot.name)
    private readonly snapshots: Model<MstyleSnapshotDocument>,
    @InjectModel(MstyleProfile.name)
    private readonly profiles: Model<MstyleProfileDocument>,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembershipDocument>,
    @InjectModel(MstyleContact.name)
    private readonly identityContacts: Model<MstyleContactDocument>,
    private readonly contactProof: MstyleContactProofService,
    private readonly consentService: MstyleConsentService,
    private readonly privateData: MstylePrivateDataService,
  ) {}

  async create(dto: CreateGuestDto) {
    if (dto.partyPurpose && dto.purpose && dto.partyPurpose !== dto.purpose)
      problem(422, 'VALIDATION_FAILED');
    const purpose = dto.partyPurpose ?? dto.purpose ?? 'mstyle_booking';
    if (!['mstyle_booking', 'guest_participant_declaration'].includes(purpose))
      problem(422, 'VALIDATION_FAILED');
    // Participant declarations need a parent operation/flow contract; do not create unbound parties.
    if (purpose !== 'mstyle_booking' || dto.role === 'participant')
      problem(422, 'VALIDATION_FAILED');
    const guestPartyId = Ids.guest();
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_GUEST_TTL_MS);
    if (
      expiresAt.getTime() <= Date.now() ||
      expiresAt.getTime() > Date.now() + DEFAULT_GUEST_TTL_MS
    )
      problem(422, 'VALIDATION_FAILED');
    const isPrimary = (dto.role || 'primary') === 'primary';
    const token = isPrimary ? Ids.guestToken() : undefined;
    const eventIds = [
      await this.events.emit({
        type: 'guest_party.updated',
        aggregate: { type: 'guest_party', id: guestPartyId, revision: 1 },
        guestPartyId,
        payload: { status: 'draft' },
      }),
    ];
    await this.guests.create({
      guestPartyId,
      status: 'draft',
      purpose,
      role: dto.role || 'primary',
      privateDataRevision: null,
      revision: 1,
      expiresAt,
      guestFlowAccessTokenHash: token ? sha256Hex(token) : undefined,
      consentSetRevision: 1,
    });
    return new MstyleResult(
      schema({
        guestPartyId,
        revision: 1,
        expiresAt: expiresAt.toISOString(),
        guestFlowAccessToken: token,
        eventIds,
      }),
      201,
      { 'Cache-Control': 'no-store' },
    );
  }

  async startContact(guestPartyId: string, dto: ContactChallengeDto) {
    const guest = await this.requireGuest(guestPartyId);
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
    const latest = await this.guestContacts
      .findOne({ guestPartyId, type: type })
      .sort({ revision: -1 });
    const challenge = await this.contactProof.start(
      { kind: 'guest_contact', guestPartyId },
      type,
      normalized,
      latest?.revision ?? 0,
    );
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest_party.updated',
        aggregate: {
          type: 'guest_party',
          id: guestPartyId,
          revision: guest.revision,
        },
        guestPartyId,
        payload: { status: guest.status },
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
    guestPartyId: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    await this.contactProof.verify(
      { kind: 'guest_contact', guestPartyId },
      challengeId,
      dto.code,
    );
  }

  async verifyContact(
    guestPartyId: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    void dto;
    const guest = await this.requireGuest(guestPartyId);
    const challenge = await this.contactProof.consume(
      { kind: 'guest_contact', guestPartyId },
      challengeId,
    );
    const value = decryptJson<string>(
      this.cfg.piiSecret(),
      challenge.pendingValueEnc!,
    );
    const type = challenge.contactType as 'phone' | 'email';
    const latest = await this.guestContacts
      .findOne({ guestPartyId, type })
      .sort({ revision: -1 });
    if ((latest?.revision ?? 0) !== challenge.baseContactValueRevision)
      problem(412, 'PRECONDITION_FAILED');
    const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${value}`);
    let contact = await this.guestContacts
      .findOne({ guestPartyId, type })
      .sort({ updatedAt: -1, revision: -1 });
    if (!contact) {
      contact = await this.guestContacts.create({
        contactId: Ids.guestContact(),
        guestPartyId,
        type,
        masked: maskContact(type, value),
        valueEnc: encryptJson(this.cfg.piiSecret(), value),
        valueHash,
        verifiedAt: nowIso(),
        revision: 1,
      });
    } else {
      contact.masked = maskContact(type, value);
      contact.valueEnc = encryptJson(this.cfg.piiSecret(), value);
      contact.valueHash = valueHash;
      contact.verifiedAt = nowIso();
      contact.revision += 1;
      await contact.save();
    }
    guest.primaryContact = {
      type,
      displayMasked: contact.masked,
      verifiedAt: contact.verifiedAt,
    };
    guest.status = ['draft', 'contact_verified'].includes(guest.status)
      ? 'verified'
      : guest.status;
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest_contact.updated',
        aggregate: {
          type: 'guest_contact',
          id: contact.contactId,
          revision: contact.revision,
        },
        guestPartyId,
      }),
    ];
    return new MstyleResult(
      schema({
        guestPartyId,
        guestPartyStatus: guest.status,
        guestPartyRevision: guest.revision,
        contact: contactDto(contact, value),
        eventIds,
      }),
      200,
      { ETag: etag('guest', guest.revision), 'Cache-Control': 'no-store' },
    );
  }

  async status(guestPartyId: string) {
    const guest = await this.requireGuest(guestPartyId);
    return new MstyleResult(guestStatusDto(guest), 200, {
      ETag: etag('guest', guest.revision),
    });
  }

  async confirmBooking(
    guestPartyId: string,
    dto: ConfirmBookingDto,
    ifMatch?: string,
  ) {
    const guest = await this.requireGuest(guestPartyId);
    const snapshot = await this.privateData.requireSnapshot(dto.snapshotId);
    if (
      snapshot.partyType !== 'guest_party' ||
      snapshot.partyId !== guestPartyId
    )
      problem(404, 'NOT_FOUND');
    if (guest.operationLink) {
      if (
        guest.operationLink.snapshotId !== snapshot.snapshotId ||
        canonicalJson(guest.operationLink.operationRef) !==
          canonicalJson(dto.operationRef)
      )
        problem(409, 'CONFLICT');
      return new MstyleResult(
        schema({
          guestPartyId,
          status: guest.status,
          revision: guest.revision,
          operationLink: guest.operationLink,
          eventIds: guest.operationLink.eventIds || [],
        }),
        200,
        { ETag: etag('guest', guest.revision) },
      );
    }
    if (!guestWriteAllowed(guest.status) || guest.status === 'draft')
      problem(409, 'CONFLICT');
    this.assertMatch(ifMatch, guest.revision);
    const binding = await this.privateData.bindSnapshot(snapshot.snapshotId, {
      schemaVersion: '2.0',
      operationRef: dto.operationRef,
    });
    guest.status = 'booked';
    guest.revision += 1;
    const eventIds = [
      ...(binding.body as any).eventIds,
      await this.events.emit({
        type: 'guest_party.updated',
        aggregate: {
          type: 'guest_party',
          id: guestPartyId,
          revision: guest.revision,
        },
        guestPartyId,
        payload: { status: guest.status, operationRef: dto.operationRef },
      }),
    ];
    guest.operationLink = {
      schemaVersion: '2.0',
      id: Ids.operationLink(),
      operationRef: dto.operationRef,
      snapshotId: snapshot.snapshotId,
      revision: 1,
      createdAt: nowIso(),
      eventIds,
    };
    await guest.save();
    return new MstyleResult(
      schema({
        guestPartyId,
        status: 'booked',
        revision: guest.revision,
        operationLink: guest.operationLink,
        eventIds,
      }),
      200,
      { ETag: etag('guest', guest.revision) },
    );
  }

  async claim(
    guestPartyId: string,
    dto: ClaimGuestDto,
    residentSubject: string,
  ) {
    const guest = await this.requireGuest(guestPartyId);
    if (
      guest.claimedBySubject ||
      guest.claimedProfileId ||
      guest.status === 'claimed'
    ) {
      if (
        guest.claimedBySubject === residentSubject &&
        guest.claimedProfileId === dto.profileId
      ) {
        return new MstyleResult(
          schema({
            guestPartyId,
            status: 'claimed',
            claimedBySubject: residentSubject,
            claimedProfileId: dto.profileId,
            revision: guest.revision,
            eventIds: [],
          }),
          200,
          { ETag: etag('guest', guest.revision) },
        );
      }
      problem(409, 'CONFLICT', { title: 'Guest is already claimed' });
    }
    if (guest.revision !== dto.expectedGuestPartyRevision) {
      problem(412, 'PRECONDITION_FAILED');
    }
    if (guest.purpose !== 'mstyle_booking') {
      problem(409, 'CONFLICT', {
        title: 'Only a booking party can be claimed',
      });
    }
    const identity =
      await this.identities.findIdentityBySubject(residentSubject);
    if (!identity || identity.identityStatus !== 'active') {
      problem(404, 'NOT_FOUND');
    }
    const profile = await this.profiles.findOne({
      profileId: dto.profileId,
      status: 'active',
    });
    const owner = await this.memberships.findOne({
      profileId: dto.profileId,
      subject: residentSubject,
      role: 'owner',
      status: 'active',
    });
    if (!profile || !membershipIsEffective(owner)) problem(404, 'NOT_FOUND');
    const allGuestContacts = await this.guestContacts
      .find({ guestPartyId, verifiedAt: { $ne: null } })
      .sort({ updatedAt: -1, revision: -1 });
    const currentByType = new Map<string, MstyleGuestContactDocument>();
    for (const contact of allGuestContacts) {
      if (!currentByType.has(contact.type)) {
        currentByType.set(contact.type, contact);
      }
    }
    const guestContacts = [...currentByType.values()];
    const matchingContact = guestContacts.length
      ? await this.identityContacts.findOne({
          subject: residentSubject,
          verifiedAt: { $ne: null },
          $or: guestContacts.map((contact) => ({
            type: contact.type,
            valueHash: contact.valueHash,
          })),
        })
      : null;
    if (!matchingContact) {
      problem(403, 'CONTACT_OWNERSHIP_NOT_CONFIRMED');
    }
    guest.status = 'claimed';
    guest.claimedBySubject = residentSubject;
    guest.claimedProfileId = dto.profileId;
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest_party.updated',
        aggregate: {
          type: 'guest_party',
          id: guestPartyId,
          revision: guest.revision,
        },
        guestPartyId,
        subject: residentSubject,
        profileId: dto.profileId,
        payload: { status: 'claimed' },
      }),
    ];
    return new MstyleResult(
      schema({
        guestPartyId,
        status: 'claimed',
        claimedBySubject: residentSubject,
        claimedProfileId: dto.profileId,
        revision: guest.revision,
        eventIds,
      }),
      200,
      { ETag: etag('guest', guest.revision) },
    );
  }

  async search(dto: SearchGuestsDto) {
    const limit = dto.limit || 100;
    const filter: Record<string, unknown> = {};
    if (dto.query?.type === 'guestPartyId') {
      filter.guestPartyId = dto.query.value;
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
      const contacts = await this.guestContacts
        .find({ type, valueHash })
        .lean();
      if (!contacts.length) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      filter.guestPartyId = {
        $in: [...new Set(contacts.map((contact) => contact.guestPartyId))],
      };
    }
    const direction = dto.sort?.direction === 'asc' ? 1 : -1;
    const cursorContext = guestSearchCursorContext(this.cfg, dto, direction);
    const cursor = decodeGuestCursor(
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
                guestPartyId: { $gt: cursor.id },
              },
            ]
          : [
              { updatedAt: { $lt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                guestPartyId: { $lt: cursor.id },
              },
            ];
    }
    const rows = await this.guests
      .find(filter)
      .sort({ updatedAt: direction, guestPartyId: direction })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items: Record<string, unknown>[] = [];
    for (const row of slice) {
      const contacts = await this.guestContacts
        .find({ guestPartyId: row.guestPartyId })
        .sort({ updatedAt: -1, revision: -1 })
        .lean();
      const masks = new Map<string, string>();
      for (const contact of contacts) {
        if (!masks.has(contact.type)) masks.set(contact.type, contact.masked);
      }
      items.push({
        guestPartyId: row.guestPartyId,
        status: row.status,
        revision: row.revision,
        contactMasks: [...masks].map(([type, masked]) => ({ type, masked })),
      });
    }
    return new MstyleResult(
      schema({
        items,
        nextCursor: hasMore
          ? encodeGuestCursor(
              (slice[slice.length - 1] as any).updatedAt,
              slice[slice.length - 1].guestPartyId,
              direction,
              cursorContext,
              this.cfg.idempotencySecret(),
            )
          : null,
        generatedAt: nowIso(),
      }),
    );
  }

  async listConsents(guestPartyId: string) {
    await this.requireGuest(guestPartyId);
    return this.consentService.list('guest', guestPartyId);
  }
  async acceptConsent(
    guestPartyId: string,
    documentCode: string,
    dto: ConsentAcceptDto,
    ifMatch?: string,
  ) {
    await this.requireGuest(guestPartyId);
    return this.consentService.change(
      'guest',
      guestPartyId,
      documentCode,
      'accepted',
      dto,
      ifMatch,
    );
  }
  async withdrawConsent(
    guestPartyId: string,
    documentCode: string,
    ifMatch?: string,
    reasonCode?: string,
  ) {
    await this.requireGuest(guestPartyId);
    return this.consentService.change(
      'guest',
      guestPartyId,
      documentCode,
      'withdrawn',
      {},
      ifMatch,
      reasonCode,
    );
  }

  private async requireGuest(guestPartyId: string) {
    const guest = await this.guests.findOne({ guestPartyId });
    if (!guest) problem(404, 'NOT_FOUND');
    return guest;
  }

  private assertMatch(ifMatch: string | undefined, revision: number) {
    if (!ifMatch) return;
    const raw = ifMatch.replace(/^W\//, '').replace(/"/g, '').trim();
    const idx = raw.lastIndexOf('-');
    const parsedRevision = Number(raw.slice(idx + 1));
    if (
      idx < 1 ||
      raw.slice(0, idx) !== 'guest' ||
      !Number.isFinite(parsedRevision) ||
      parsedRevision !== revision
    ) {
      problem(412, 'PRECONDITION_FAILED');
    }
  }
}

function encodeGuestCursor(
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
  return `${payload}.${hmacHex(secret, `mstyle-guest-search:${payload}`)}`;
}

function decodeGuestCursor(
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
        hmacHex(secret, `mstyle-guest-search:${payload}`),
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

function guestSearchCursorContext(
  cfg: MstyleV2Config,
  dto: SearchGuestsDto,
  direction: 1 | -1,
): string {
  return hmacHex(
    cfg.idempotencySecret(),
    JSON.stringify({
      query: dto.query
        ? { type: dto.query.type, value: dto.query.value }
        : null,
      direction,
    }),
  );
}
