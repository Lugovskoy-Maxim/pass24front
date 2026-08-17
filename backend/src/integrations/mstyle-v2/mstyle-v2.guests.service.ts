import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { normalizeRuMobilePhone } from '../../common/phone';
import {
  CHALLENGE_TTL_MS,
  CODE_LENGTH,
  DEFAULT_GUEST_TTL_MS,
  RESEND_MIN_MS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  decryptJson,
  encryptJson,
  hmacHex,
  maskContact,
  normalizeEmail,
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
  MstyleGuestContact,
  MstyleGuestContactDocument,
  MstyleGuestParty,
  MstyleGuestPartyDocument,
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
  ) {}

  async create(dto: CreateGuestDto) {
    const guestPartyId = Ids.guest();
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_GUEST_TTL_MS);
    const isPrimary = (dto.role || 'primary') === 'primary';
    const token = isPrimary ? Ids.token() : undefined;
    const eventIds = [
      await this.events.emit({
        type: 'guest.created',
        aggregate: { type: 'guest_party', id: guestPartyId },
        guestPartyId,
      }),
    ];
    await this.guests.create({
      guestPartyId,
      status: 'draft',
      purpose: dto.purpose || 'booking',
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
    const latest = await this.guestContacts
      .findOne({ guestPartyId, type: dto.type })
      .sort({ revision: -1 });
    const now = Date.now();
    const challenge = await this.challenges.create({
      challengeId: Ids.challenge(),
      kind: 'guest_contact',
      clientId: 'guest',
      status: 'awaiting_code',
      channel: dto.type === 'phone' ? 'sms' : 'email',
      identifierType: dto.type,
      subject: null,
      isDummy: false,
      codeHash: await bcrypt.hash(this.cfg.mockOtp(), 8),
      codeLength: CODE_LENGTH,
      verifyAttempts: 0,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
      resendAfter: new Date(now + RESEND_MIN_MS),
      contactType: dto.type,
      displayMasked: maskContact(dto.type, normalized),
      expectedContactValueRevision: latest?.revision ?? 0,
      guestPartyId,
      pendingValueEnc: encryptJson(this.cfg.piiSecret(), normalized),
    });
    const eventIds = [
      await this.events.emit({
        type: 'guest.contact_challenge',
        aggregate: { type: 'guest_party', id: guestPartyId },
        guestPartyId,
      }),
    ];
    guest.revision += 1;
    await guest.save();
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

  async verifyContact(
    guestPartyId: string,
    challengeId: string,
    dto: ContactVerifyDto,
  ) {
    const guest = await this.requireGuest(guestPartyId);
    const challenge = await this.challenges.findOne({
      challengeId,
      guestPartyId,
      kind: 'guest_contact',
    });
    if (!challenge) problem(404, 'NOT_FOUND');
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
    const valueHash = hmacHex(this.cfg.piiSecret(), `${type}:${value}`);
    let contact = await this.guestContacts.findOne({
      guestPartyId,
      type,
      valueHash,
    });
    if (!contact) {
      contact = await this.guestContacts.create({
        contactId: Ids.contact(),
        guestPartyId,
        type,
        masked: maskContact(type, value),
        valueEnc: encryptJson(this.cfg.piiSecret(), value),
        valueHash,
        verifiedAt: nowIso(),
        revision: 1,
      });
    } else {
      contact.verifiedAt = nowIso();
      contact.revision += 1;
      await contact.save();
    }
    guest.primaryContact = {
      type,
      displayMasked: contact.masked,
      verifiedAt: contact.verifiedAt,
    };
    guest.status = guest.status === 'draft' ? 'contact_verified' : guest.status;
    guest.revision += 1;
    await guest.save();
    challenge.status = 'consumed';
    await challenge.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest.contact_verified',
        aggregate: { type: 'guest_party', id: guestPartyId },
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

  async confirmBooking(guestPartyId: string, dto: ConfirmBookingDto) {
    const guest = await this.requireGuest(guestPartyId);
    const snapshot = await this.snapshots.findOne({
      snapshotId: dto.snapshotId,
      partyId: guestPartyId,
    });
    if (!snapshot) problem(404, 'NOT_FOUND');
    guest.status = 'booked';
    guest.revision += 1;
    guest.operationLink = {
      operationRef: dto.operationRef,
      snapshotId: dto.snapshotId,
      bindingRevision: 1,
    };
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest.booked',
        aggregate: { type: 'guest_party', id: guestPartyId },
        guestPartyId,
        payload: { operationRef: dto.operationRef },
      }),
    ];
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

  async claim(guestPartyId: string, dto: ClaimGuestDto) {
    const guest = await this.requireGuest(guestPartyId);
    const identity = await this.identities.findIdentityBySubject(dto.subject);
    if (!identity) problem(404, 'NOT_FOUND');
    guest.status = 'claimed';
    guest.claimedBySubject = dto.subject;
    guest.claimedProfileId = dto.claimedProfileId || null;
    guest.revision += 1;
    await guest.save();
    const eventIds = [
      await this.events.emit({
        type: 'guest.claimed',
        aggregate: { type: 'guest_party', id: guestPartyId },
        guestPartyId,
        subject: dto.subject,
        profileId: dto.claimedProfileId,
      }),
    ];
    return new MstyleResult(
      schema({
        guestPartyId,
        status: 'claimed',
        claimedBySubject: dto.subject,
        claimedProfileId: guest.claimedProfileId,
        revision: guest.revision,
        eventIds,
      }),
      200,
      { ETag: etag('guest', guest.revision) },
    );
  }

  async search(dto: SearchGuestsDto) {
    const limit = dto.limit || 20;
    const filter: Record<string, unknown> = {};
    if (dto.query?.guestPartyId) filter.guestPartyId = dto.query.guestPartyId;
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
      const contact = await this.guestContacts.findOne({ type, valueHash });
      if (!contact) {
        return new MstyleResult(
          schema({ items: [], nextCursor: null, generatedAt: nowIso() }),
        );
      }
      filter.guestPartyId = contact.guestPartyId;
    }
    const rows = await this.guests
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items: Record<string, unknown>[] = [];
    for (const row of slice) {
      const contacts = await this.guestContacts
        .find({ guestPartyId: row.guestPartyId })
        .lean();
      items.push({
        guestPartyId: row.guestPartyId,
        status: row.status,
        revision: row.revision,
        contactMasks: contacts.map((c) => ({
          type: c.type,
          masked: c.masked,
        })),
      });
    }
    return new MstyleResult(
      schema({
        items,
        nextCursor: hasMore ? slice[slice.length - 1].guestPartyId : null,
        generatedAt: nowIso(),
      }),
    );
  }

  async listConsents(guestPartyId: string) {
    await this.requireGuest(guestPartyId);
    const items = await this.consents
      .find({ partyType: 'guest', partyId: guestPartyId })
      .lean();
    const revision = items.reduce((max, i) => Math.max(max, i.revision), 1);
    return new MstyleResult(
      schema({
        guestPartyId,
        consentSetRevision: revision,
        items: items.map((item) => ({
          documentCode: item.documentCode,
          documentVersion: item.documentVersion,
          documentDigest: item.documentDigest,
          documentUrl: item.documentUrl,
          locale: item.locale,
          status: item.status,
          revision: item.revision,
          acceptedAt: item.acceptedAt,
          withdrawnAt: item.withdrawnAt,
          auditRef: item.auditRef,
        })),
      }),
      200,
      { ETag: etag('consents', revision), 'Cache-Control': 'no-store' },
    );
  }

  async acceptConsent(
    guestPartyId: string,
    documentCode: string,
    dto: ConsentAcceptDto,
  ) {
    await this.requireGuest(guestPartyId);
    return this.directory.upsertConsent(
      'guest',
      guestPartyId,
      documentCode,
      dto,
      'accepted',
    );
  }

  async withdrawConsent(guestPartyId: string, documentCode: string) {
    await this.requireGuest(guestPartyId);
    return this.directory.upsertConsent(
      'guest',
      guestPartyId,
      documentCode,
      {
        schemaVersion: '2.0',
        documentVersion: '',
        documentDigest: '',
      },
      'withdrawn',
    );
  }

  private async requireGuest(guestPartyId: string) {
    const guest = await this.guests.findOne({ guestPartyId });
    if (!guest) problem(404, 'NOT_FOUND');
    return guest;
  }
}
