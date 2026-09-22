import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongodb';
import { OperationsStore } from './operations.store';
import {
  fail,
  OperationsActor,
  requirePermission,
  textValue,
} from './operations.rules';
import { membershipIsEffective } from '../integrations/mstyle-v2/mstyle-v2.membership-policy';
import { MstyleDirectoryService } from '../integrations/mstyle-v2/mstyle-v2.directory.service';
import { MstylePrivateDataService } from '../integrations/mstyle-v2/mstyle-v2.private-data.service';
import { MstyleV2Config } from '../integrations/mstyle-v2/mstyle-v2.config';
import {
  normalizeResidentInput,
  validateResidentValues,
} from '../integrations/mstyle-v2/mstyle-v2.private-values';
import { Ids, snapshotQuery } from '../integrations/mstyle-v2/mstyle-v2.ids';
import {
  decryptJson,
  encryptJson,
  hmacHex,
} from '../integrations/mstyle-v2/mstyle-v2.crypto';

@Injectable()
export class OperationsIdentity {
  constructor(
    readonly store: OperationsStore,
    private readonly directory: MstyleDirectoryService,
    private readonly privateData: MstylePrivateDataService,
    private readonly config: MstyleV2Config,
  ) {}

  async nativeActor(user: any): Promise<OperationsActor> {
    const identity = await this.store
      .canonical('identities')
      .findOne({ userId: String(user.userId) });
    return {
      ref: 'pass-admin:' + user.userId,
      kind: 'admin',
      name: user.fullName || user.full_name || 'Администратор',
      subject: identity?.subject,
      permissions: user.permissions || [],
    };
  }
  async profile(
    actor: OperationsActor,
    profileId: string,
    session?: ClientSession,
  ) {
    const profile = await this.store
      .canonical('profiles')
      .findOne({ profileId, status: 'active' }, { session });
    if (!profile) fail('profile_unavailable', 'Профиль недоступен.', 404);
    if (actor.kind !== 'admin' && actor.kind !== 'system') {
      if (actor.kind !== 'resident' || !actor.subject)
        fail('forbidden', 'Нет доступа к профилю.', 403);
      const membership = await this.store
        .canonical('memberships')
        .findOne({ profileId, subject: actor.subject }, { session });
      if (!membershipIsEffective(membership))
        fail('forbidden', 'Нет доступа к профилю.', 403);
    }
    const resourceId = profile.resourceOwnerProfileId || profileId;
    const resource =
      resourceId === profileId
        ? profile
        : await this.store
            .canonical('profiles')
            .findOne({ profileId: resourceId, status: 'active' }, { session });
    if (
      !resource ||
      (resource.resourceOwnerProfileId &&
        resource.resourceOwnerProfileId !== resource.profileId)
    )
      fail('profile_unavailable', 'Недоступен профиль-владелец ресурсов.');
    return { profile, resource };
  }
  async assertCanSpendHours(
    actor: OperationsActor,
    profileId: string,
    session?: ClientSession,
  ) {
    if (actor.kind !== 'resident') return;
    const membership = await this.store
      .canonical('memberships')
      .findOne({ profileId, subject: actor.subject }, { session });
    if (!membershipIsEffective(membership) || membership.role === 'employee')
      fail(
        'balance_not_available_for_employee',
        'Списание резидентских часов недоступно для этого участника профиля.',
        403,
      );
  }
  async hoursResource(actor: OperationsActor, profileId: string) {
    if (actor.kind === 'admin') {
      requirePermission(actor, 'bookings.manage');
      const resource = await this.store
        .canonical('profiles')
        .findOne({ profileId });
      if (!resource)
        fail(
          'profile_unavailable',
          'Не найден владелец исторического баланса.',
          404,
        );
      return resource;
    }
    const ids = await this.profileIds(actor);
    if (ids.includes(profileId))
      return (await this.profile(actor, profileId)).resource;
    const child = await this.store.canonical('profiles').findOne({
      profileId: { $in: ids },
      status: 'active',
      resourceOwnerProfileId: profileId,
    });
    if (!child) fail('forbidden', 'Нет доступа к балансу.', 403);
    const root = await this.store
      .canonical('profiles')
      .findOne({ profileId, status: 'active' });
    if (!root) fail('profile_unavailable', 'Баланс недоступен.', 404);
    return root;
  }
  async profileIds(
    actor: OperationsActor,
    session?: ClientSession,
  ): Promise<string[]> {
    if (actor.kind !== 'resident' || !actor.subject) return [];
    return (
      await this.store
        .canonical('memberships')
        .find({ subject: actor.subject, status: 'active' }, { session })
        .toArray()
    )
      .filter((row) => membershipIsEffective(row))
      .map((m) => m.profileId);
  }
  async assertBooking(
    actor: OperationsActor,
    booking: any,
    session?: ClientSession,
  ) {
    if (!booking) fail('booking_not_found', 'Бронирование не найдено.', 404);
    if (actor.kind === 'admin') {
      requirePermission(actor, 'bookings.manage');
      return;
    }
    if (actor.kind === 'system') return;
    if (
      actor.kind === 'guest' &&
      actor.guestPartyId === booking.pass_party_id &&
      booking.pass_party_type === 'guest_party'
    )
      return;
    if (actor.kind === 'resident') {
      const ids = await this.profileIds(actor, session);
      if (
        booking.owner_subject === actor.subject ||
        ids.includes(booking.profile_id)
      )
        return;
    }
    fail('booking_not_found', 'Бронирование не найдено.', 404);
  }
  async declaredGuest(
    actor: OperationsActor,
    input: any,
    session: ClientSession,
  ) {
    requirePermission(actor, 'bookings.manage');
    const name = textValue(input.name, 191, true);
    const phone = textValue(input.phone, 40, true);
    if (!/^\+?[0-9 ()-]{7,30}$/.test(phone))
      fail('validation_error', 'Проверьте телефон гостя.', 400);
    const email = textValue(input.email, 191);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail('validation_error', 'Проверьте email гостя.', 400);
    const guestPartyId = Ids.guest();
    const snapshotId = Ids.snapshot();
    const payload = {
      values: {},
      contacts: { displayName: name, phone, email },
      sourceRevisions: { guestPartyRevision: 1 },
      declaredBy: actor.ref,
    };
    await this.store.canonical('guest_parties').insertOne(
      {
        guestPartyId,
        status: 'booked',
        purpose: 'mstyle_booking',
        role: 'primary',
        revision: 1,
        displayName: name,
        privateDataRevision: null,
        consentSetRevision: 1,
        expiresAt: new Date(Date.now() + 86400000),
        primaryContact: {
          type: 'phone',
          displayMasked: phone.slice(0, 2) + '***' + phone.slice(-2),
          verifiedAt: null,
        },
      },
      { session },
    );
    await this.store.canonical('snapshots').insertOne(
      {
        snapshotId,
        partyType: 'guest_party',
        partyId: guestPartyId,
        snapshotRevision: 1,
        contentDigest: {
          algorithm: 'HMAC-SHA-256',
          keyVersion: 1,
          value: hmacHex(this.config.piiSecret(), JSON.stringify(payload)),
        },
        eventIds: [],
        sourceRevisions: payload.sourceRevisions,
        payloadEnc: encryptJson(this.config.piiSecret(), payload),
        createdAtIso: new Date().toISOString(),
      },
      { session },
    );
    return {
      owner_subject: null,
      profile_id: null,
      resource_profile_id: null,
      pass_party_type: 'guest_party',
      pass_party_id: guestPartyId,
      pass_snapshot_id: snapshotId,
      requester: { name, phone, email },
      client_type: 'guest',
      profile_type: 'individual',
      legal_form: null,
      requisites_complete: false,
    };
  }
  async guestInvoiceSnapshot(
    actor: OperationsActor,
    booking: any,
    input: any,
    session: ClientSession,
  ) {
    requirePermission(actor, 'bookings.finance');
    if (booking.pass_party_type !== 'guest_party')
      fail(
        'validation_error',
        'Реквизиты резидента изменяются в его профиле.',
        400,
      );
    const profileType =
      input.profile_type === 'company' ? 'company' : 'individual';
    const legalForm =
      profileType === 'company'
        ? input.legal_form === 'ip'
          ? 'ip'
          : 'ooo'
        : null;
    let values: Record<string, unknown>;
    try {
      values = validateResidentValues(
        normalizeResidentInput(input.values || {}, profileType, legalForm),
        profileType,
        legalForm,
      );
    } catch {
      fail(
        'profile_data_required',
        'Проверьте обязательные реквизиты заказчика счёта.',
        422,
      );
    }
    const original = await this.requester(booking, session);
    const email = textValue(input.email || original.email, 191);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail('validation_error', 'Проверьте email для отправки счёта.', 400);
    const snapshotId = Ids.snapshot();
    const payload = {
      values,
      contacts: { displayName: original.name, phone: original.phone, email },
      declaredBy: actor.ref,
      snapshotKind: 'booking_legal_snapshot',
    };
    await this.store.canonical('snapshots').insertOne(
      {
        snapshotId,
        partyType: 'guest_party',
        partyId: booking.pass_party_id,
        snapshotRevision: 1,
        contentDigest: {
          algorithm: 'HMAC-SHA-256',
          keyVersion: 1,
          value: hmacHex(this.config.piiSecret(), JSON.stringify(payload)),
        },
        payloadEnc: encryptJson(this.config.piiSecret(), payload),
        createdAtIso: new Date().toISOString(),
        eventIds: [],
      },
      { session },
    );
    return {
      pass_snapshot_id: snapshotId,
      profile_type: profileType,
      legal_form: legalForm,
    };
  }
  async party(actor: OperationsActor, input: any) {
    if (actor.kind === 'guest' || input.party_type === 'guest_party') {
      const id =
        actor.kind === 'guest' ? actor.guestPartyId : input.guest_party_id;
      const guest = await this.store
        .canonical('guest_parties')
        .findOne({ guestPartyId: id });
      if (
        !guest?.primaryContact?.verifiedAt ||
        !['contact_verified', 'verified', 'ready'].includes(guest.status)
      )
        fail('guest_not_verified', 'Подтвердите телефон гостя.', 409);
      const snapshot = await this.snapshot(
        input.snapshot_id,
        'guest_party',
        id!,
      );
      return {
        owner_subject: null,
        profile_id: null,
        resource_profile_id: null,
        pass_party_type: 'guest_party',
        pass_party_id: id,
        pass_snapshot_id: snapshot.snapshotId,
        requester: this.contact(snapshot),
        client_type: 'guest',
        profile_type: input.profile_type || 'individual',
        legal_form: input.legal_form || null,
      };
    }
    const { profile, resource } = await this.profile(actor, input.profile_id);
    if (input.payment_method === 'invoice' && !profile.privateDataComplete)
      fail(
        'profile_data_required',
        'Для оплаты по счёту заполните и сохраните раздел «Данные резидента».',
        409,
      );
    let ownerSubject = actor.kind === 'resident' ? actor.subject : undefined;
    if (actor.kind === 'admin') {
      const memberships = await this.store
        .canonical('memberships')
        .find({ profileId: profile.profileId, status: 'active' })
        .toArray();
      const owner = memberships
        .filter((m) => membershipIsEffective(m))
        .find((m) =>
          input.owner_subject
            ? m.subject === input.owner_subject
            : m.role === 'owner',
        );
      if (!owner)
        fail('profile_unavailable', 'Не найден действующий участник профиля.');
      ownerSubject = owner.subject;
    }
    let snapshotId = input.snapshot_id;
    if (!snapshotId) {
      const subject = ownerSubject;
      if (!subject) fail('profile_unavailable', 'Не найден владелец профиля.');
      const context: any = (await this.directory.getContext(subject)).body;
      const item = context.profiles.find(
        (p: any) => p.profileId === profile.profileId,
      );
      if (!item) fail('profile_unavailable', 'Не найден профиль.');
      const frozen: any = (
        await this.privateData.snapshotResident(profile.profileId, {
          schemaVersion: '2.0',
          snapshotKind:
            input.payment_method === 'invoice'
              ? 'booking_legal_snapshot'
              : 'booking_request_snapshot',
          contactPurpose: 'primary',
          expectedSourceRevisions: item.snapshotSources.primary,
        })
      ).body;
      snapshotId = frozen.snapshotId;
    }
    const snapshot = await this.snapshot(
      snapshotId,
      'resident_profile',
      profile.profileId,
    );
    return {
      owner_subject: ownerSubject || null,
      profile_id: profile.profileId,
      resource_profile_id: resource.profileId,
      pass_party_type: 'resident_profile',
      pass_party_id: profile.profileId,
      pass_snapshot_id: snapshot.snapshotId,
      requester: this.contact(snapshot),
      client_type: 'resident',
      profile_type: profile.type,
      legal_form: profile.legalForm,
    };
  }
  async snapshot(
    id: string,
    partyType: string,
    partyId: string,
    session?: ClientSession,
  ) {
    const snapshot = await this.store
      .canonical('snapshots')
      .findOne({ ...snapshotQuery(id), partyType, partyId }, { session });
    if (!snapshot)
      fail('snapshot_invalid', 'Не удалось проверить данные заказчика.', 409);
    return snapshot;
  }
  contact(snapshot: any) {
    const payload: any = decryptJson(
      this.config.piiSecret(),
      snapshot.payloadEnc,
    );
    return {
      name: payload.contacts?.displayName || '',
      phone: payload.contacts?.phone || '',
      email: payload.contacts?.email || '',
    };
  }
  async requester(booking: any, session?: ClientSession) {
    if (!booking.pass_snapshot_id)
      return booking.legacy_requester || { name: '', phone: '', email: '' };
    return this.contact(
      await this.snapshot(
        booking.pass_snapshot_id,
        booking.pass_party_type,
        booking.pass_party_id,
        session,
      ),
    );
  }
}
