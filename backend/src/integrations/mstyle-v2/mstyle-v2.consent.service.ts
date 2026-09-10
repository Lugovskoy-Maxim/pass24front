import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { MstyleConsent, MstyleConsentSet } from './mstyle-v2.schemas';
import { MstyleEventsService } from './mstyle-v2.events';
import { MstyleResult, problem } from './mstyle-v2.problem';
import { consentItem, etag, nowIso, schema } from './mstyle-v2.present';
import { Ids, publicConsentId } from './mstyle-v2.ids';
import type { ConsentAcceptDto } from './mstyle-v2.dto';

type Party = 'resident' | 'guest';
type Definition = {
  documentCode: string;
  documentVersion: string;
  documentDigest: string;
  documentUrl: string;
  locale: string;
  evidenceCodes: string[];
};

@Injectable()
export class MstyleConsentService {
  constructor(
    private readonly config: ConfigService,
    private readonly events: MstyleEventsService,
    @InjectModel(MstyleConsent.name)
    private readonly rows: Model<MstyleConsent>,
    @InjectModel(MstyleConsentSet.name)
    private readonly sets: Model<MstyleConsentSet>,
  ) {}

  definitions(): Definition[] {
    let values: Definition[];
    try {
      values = JSON.parse(
        this.config.get<string>('MSTYLE_CONSENT_DOCUMENTS_JSON') || 'null',
      );
    } catch {
      problem(503, 'UPSTREAM_UNAVAILABLE');
    }
    if (
      !Array.isArray(values) ||
      !values.length ||
      new Set(values.map((d) => d.documentCode)).size !== values.length ||
      values.some(
        (d) =>
          !/^[a-z][a-z0-9_]+$/.test(d.documentCode) ||
          !d.documentVersion ||
          !/^sha256:[a-f0-9]{64}$/.test(d.documentDigest) ||
          !/^https:\/\/[^/]+\//.test(d.documentUrl) ||
          !d.locale ||
          !Array.isArray(d.evidenceCodes) ||
          !d.evidenceCodes.length ||
          d.evidenceCodes.some((c) => !/^[a-z][a-z0-9_]+$/.test(c)),
      )
    )
      problem(503, 'UPSTREAM_UNAVAILABLE', {
        title: 'Consent document configuration is missing or invalid',
      });
    return values;
  }

  private async synchronize(partyType: Party, partyId: string) {
    const definitions = this.definitions();
    let set = await this.sets.findOne({ partyType, partyId });
    const freshSet = !set;
    if (!set) {
      const old = await this.rows.find({ partyType, partyId });
      set = await this.sets.create({
        partyType,
        partyId,
        revision: Math.max(1, ...old.map((row) => row.revision)),
      });
    }
    for (const definition of definitions) {
      let row = await this.rows.findOne({
        partyType,
        partyId,
        documentCode: definition.documentCode,
      });
      if (!row) {
        row = await this.rows.create({
          ...definition,
          partyType,
          partyId,
          status: 'required',
          revision: 1,
        });
        if (!freshSet) {
          set.revision += 1;
          await this.emit(partyType, partyId, row);
        }
      } else if (
        row.documentVersion !== definition.documentVersion ||
        row.documentDigest !== definition.documentDigest ||
        row.locale !== definition.locale ||
        row.documentUrl !== definition.documentUrl
      ) {
        Object.assign(row, definition, {
          status: 'required',
          revision: row.revision + 1,
          acceptedAt: null,
          withdrawnAt: null,
          auditRef: null,
        });
        await row.save();
        set.revision += 1;
        await this.emit(partyType, partyId, row);
      }
    }
    await set.save();
    return set;
  }

  async list(partyType: Party, partyId: string) {
    this.rows.db.base.set('transactionAsyncLocalStorage', true);
    return this.rows.db.transaction(async () => {
      const set = await this.synchronize(partyType, partyId);
      const items = await this.rows
        .find({ partyType, partyId })
        .sort({ documentCode: 1 });
      return new MstyleResult(
        schema({
          [partyType === 'guest' ? 'guestPartyId' : 'subject']: partyId,
          consentSetRevision: set.revision,
          items: items.map(consentItem),
        }),
        200,
        { ETag: etag('consents', set.revision), 'Cache-Control': 'no-store' },
      );
    });
  }

  async change(
    partyType: Party,
    partyId: string,
    documentCode: string,
    status: 'accepted' | 'withdrawn',
    dto: Partial<ConsentAcceptDto>,
    ifMatch?: string,
    reasonCode?: string,
  ) {
    const definition = this.definitions().find(
      (row) => row.documentCode === documentCode,
    );
    if (!definition) problem(404, 'NOT_FOUND');
    const set = await this.synchronize(partyType, partyId);
    if (ifMatch !== etag('consents', set.revision))
      problem(412, 'PRECONDITION_FAILED');
    const row = (await this.rows.findOne({
      partyType,
      partyId,
      documentCode,
    }))!;
    if (
      status === 'accepted' &&
      (dto.documentVersion !== definition.documentVersion ||
        dto.documentDigest !== definition.documentDigest ||
        dto.locale !== definition.locale ||
        !definition.evidenceCodes.includes(dto.evidenceCode || '') ||
        (dto.documentUrl && dto.documentUrl !== definition.documentUrl))
    )
      problem(422, 'VALIDATION_FAILED');
    if (
      status === 'withdrawn' &&
      reasonCode !==
        (partyType === 'guest'
          ? 'guest_preference_changed'
          : 'resident_preference_changed')
    )
      problem(422, 'VALIDATION_FAILED');
    const now = nowIso();
    row.status = status;
    row.revision += 1;
    row.auditRef = Ids.audit();
    if (status === 'accepted') {
      row.acceptedAt = now;
      row.withdrawnAt = null;
    } else row.withdrawnAt = now;
    row.history.push({
      status,
      documentVersion: row.documentVersion,
      documentDigest: row.documentDigest,
      documentUrl: row.documentUrl,
      locale: row.locale,
      auditRef: row.auditRef,
      recordedAt: now,
      ...(dto.evidenceCode ? { evidenceCode: dto.evidenceCode } : {}),
      ...(reasonCode ? { reasonCode } : {}),
    });
    await row.save();
    set.revision += 1;
    await set.save();
    const eventIds = [await this.emit(partyType, partyId, row)];
    return new MstyleResult(
      schema({
        [partyType === 'guest' ? 'guestPartyId' : 'subject']: partyId,
        consentSetRevision: set.revision,
        item: consentItem(row),
        eventIds,
      }),
      200,
      { ETag: etag('consents', set.revision), 'Cache-Control': 'no-store' },
    );
  }

  async assertAccepted(partyType: Party, partyId: string) {
    for (const definition of this.definitions()) {
      const row = await this.rows.findOne({
        partyType,
        partyId,
        documentCode: definition.documentCode,
        documentVersion: definition.documentVersion,
        documentDigest: definition.documentDigest,
        locale: definition.locale,
        status: 'accepted',
      });
      if (!row)
        problem(409, 'CONFLICT', { title: 'Current consent is required' });
    }
  }

  private emit(partyType: Party, partyId: string, row: MstyleConsent) {
    const type = partyType === 'guest' ? 'guest_consent' : 'resident_consent';
    return this.events.emit({
      type: `${type}.updated`,
      aggregate: {
        type,
        id: publicConsentId(`${partyId}:${row.documentCode}`),
        revision: row.revision,
      },
      subject: partyType === 'resident' ? partyId : undefined,
      guestPartyId: partyType === 'guest' ? partyId : undefined,
      payload: { documentCode: row.documentCode },
    });
  }
}
