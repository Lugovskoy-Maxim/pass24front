import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { OperationsStore } from '../../operations/operations.store';
import { Bitrix24Client, Bitrix24Error } from './bitrix24.client';

const text = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
const key = (value: string) => createHash('sha256').update(value).digest('hex');
const companyKey = (value: string) => text(value).toLocaleLowerCase('ru');

export class Bitrix24Customers {
  constructor(
    private readonly store: OperationsStore,
    private readonly client: Bitrix24Client,
  ) {}

  async describe(ticket: any) {
    const identity = ticket.owner_subject
      ? await this.store.canonical('identities').findOne(
          { subject: ticket.owner_subject },
          {
            projection: {
              subject: 1,
              displayName: 1,
              name: 1,
              phone: 1,
              email: 1,
            },
          },
        )
      : null;
    const profile = ticket.profile_id
      ? await this.store
          .canonical('profiles')
          .findOne({ profileId: ticket.profile_id })
      : null;
    const resource = profile?.resourceOwnerProfileId
      ? await this.store
          .canonical('profiles')
          .findOne({ profileId: profile.resourceOwnerProfileId })
      : profile;
    const officeIds: string[] = ticket.office_id
      ? [String(ticket.office_id)]
      : [...new Set<string>((ticket.office_ids || []).map(String))];
    const offices = officeIds.length
      ? await this.store.connection
          .db!.collection<any>('offices')
          .find(
            {
              $or: [
                { externalId: { $in: officeIds } },
                {
                  _id: {
                    $in: officeIds
                      .filter((id) => /^[a-f\d]{24}$/i.test(id))
                      .map((id) => new ObjectId(id)),
                  },
                },
              ],
            },
            { projection: { number: 1, company: 1, externalId: 1 } },
          )
          .sort({ number: 1, _id: 1 })
          .toArray()
      : [];
    const officeCompanies = [
      ...new Set(offices.map((office) => text(office.company)).filter(Boolean)),
    ];
    const ownLink = profile?.profileId
      ? await this.store
          .collection('bitrix_state')
          .findOne({ _id: `tenant-company:${profile.profileId}` })
      : null;
    const companyLink = ownLink?.company_id
      ? ownLink
      : resource?.profileId
        ? await this.store
            .collection('bitrix_state')
            .findOne({ _id: `tenant-company:${resource.profileId}` })
        : null;
    const company =
      companyLink?.company_name ||
      (officeCompanies.length === 1
        ? officeCompanies[0]
        : text(
            resource?.companyName ||
              resource?.companyShortName ||
              profile?.companyName ||
              profile?.companyShortName,
          ));
    const customer = {
      subject: identity?.subject || '',
      name: text(identity?.displayName || ticket.requester_name),
      firstName: text(identity?.name?.firstName),
      lastName: text(identity?.name?.lastName),
      middleName: text(identity?.name?.middleName),
      phone: text(identity?.phone),
      email: text(identity?.email).toLowerCase(),
      company,
      companyId: companyLink?.company_id
        ? this.id(companyLink.company_id)
        : null,
    };
    const officeNumbers = offices
      .map((office) => text(office.number))
      .filter(Boolean);
    const officeTitle = officeNumbers.length
      ? `${officeNumbers.length === 1 ? 'Офис' : 'Офисы'} ${officeNumbers.join(', ')}`
      : '';
    const title = [
      officeTitle.slice(0, 100),
      text(ticket.subject) ||
        text(ticket.topic_label) ||
        `Заявка №${ticket.id}`,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 255);
    const description = [
      `Заявка Pass №${ticket.id}`,
      ticket.topic_label,
      `Заявитель: ${customer.name || 'Резидент'}`,
      customer.phone && `Телефон: ${customer.phone}`,
      customer.email && `Email: ${customer.email}`,
      company && `Компания: ${company}`,
      ...offices.map(
        (office) =>
          `Офис ${text(office.number)}${office.company ? ' · ' + text(office.company) : ''}`,
      ),
      ticket.service_order &&
        `Услуга: ${ticket.service_order.name} · ${ticket.service_order.quantity} шт.`,
      ticket.service_order?.totalAmountMinor != null &&
        `Стоимость: ${(ticket.service_order.totalAmountMinor / 100).toFixed(2)} руб.`,
    ]
      .filter(Boolean)
      .join('\n');
    return { title, description, customer, officeNumbers };
  }

  private async assertWritable() {
    if ((await this.store.ownership())?.mode !== 'pass')
      throw new Bitrix24Error('operations_paused');
  }

  private id(value: unknown) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Bitrix24Error('invalid_response');
    return id;
  }

  private async updateDeal(id: number, fields: Record<string, unknown>) {
    await this.assertWritable();
    const { result } = await this.client.call<boolean>('crm.deal.update', {
      id,
      fields,
    });
    if (result !== true) throw new Bitrix24Error('invalid_response');
  }

  private async resolve(
    entity: 'contact' | 'company',
    source: string,
    fields: Record<string, unknown>,
    findExisting: () => Promise<number | null>,
  ) {
    const originator = this.client.originator();
    const originId = `${entity}:${key(source)}`;
    const stateId = `customer:${originator}:${originId}`;
    const state = await this.store
      .collection('bitrix_state')
      .findOne({ _id: stateId });
    if (state?.crm_id) {
      const linked = await this.client.list<any>(`crm.${entity}.list`, {
        filter: { ID: state.crm_id },
        select: ['ID'],
      });
      if (linked.length === 1) return this.id(linked[0].ID);
    }
    const owned = await this.client.list<any>(`crm.${entity}.list`, {
      filter: { ORIGINATOR_ID: originator, ORIGIN_ID: originId },
      select: ['ID'],
    });
    if (owned.length > 1) throw new Bitrix24Error('customer_ambiguous');
    let id = owned.length ? this.id(owned[0].ID) : await findExisting();
    if (!id) {
      if (['sending', 'uncertain'].includes(state?.create_state))
        throw new Bitrix24Error('customer_delivery_uncertain');
      await this.assertWritable();
      await this.store
        .collection('bitrix_state')
        .updateOne(
          { _id: stateId },
          { $set: { create_state: 'sending' } },
          { upsert: true },
        );
      try {
        await this.assertWritable();
        const response = await this.client.call<number>(`crm.${entity}.add`, {
          fields: {
            ...fields,
            OPENED: 'N',
            ORIGINATOR_ID: originator,
            ORIGIN_ID: originId,
          },
        });
        id = this.id(response.result);
      } catch (error) {
        await this.store.collection('bitrix_state').updateOne(
          { _id: stateId },
          {
            $set: {
              create_state:
                error instanceof Bitrix24Error &&
                !error.uncertain &&
                error.code !== 'invalid_response'
                  ? 'pending'
                  : 'uncertain',
            },
          },
        );
        throw error;
      }
    }
    await this.store
      .collection('bitrix_state')
      .updateOne(
        { _id: stateId },
        { $set: { crm_id: id, create_state: 'linked' } },
        { upsert: true },
      );
    return id;
  }

  async company(name: string) {
    if (!name) return null;
    return this.resolve(
      'company',
      companyKey(name),
      { TITLE: name, COMPANY_TYPE: 'CUSTOMER' },
      async () => {
        const companies = await this.client.list<any>('crm.company.list', {
          filter: { '=TITLE': name },
          select: ['ID', 'TITLE'],
        });
        const matches = companies.filter(
          (item) => companyKey(item.TITLE) === companyKey(name),
        );
        if (matches.length > 1) throw new Bitrix24Error('customer_ambiguous');
        return matches.length ? this.id(matches[0].ID) : null;
      },
    );
  }

  async contact(
    customer: Awaited<ReturnType<Bitrix24Customers['describe']>>['customer'],
    companyId: number | null,
  ) {
    if (!customer.subject || !customer.name) return null;
    return this.resolve(
      'contact',
      customer.subject,
      {
        NAME: customer.firstName || customer.name,
        ...(customer.lastName ? { LAST_NAME: customer.lastName } : {}),
        ...(customer.middleName ? { SECOND_NAME: customer.middleName } : {}),
        ...(customer.phone
          ? { PHONE: [{ VALUE: customer.phone, VALUE_TYPE: 'WORK' }] }
          : {}),
        ...(customer.email
          ? { EMAIL: [{ VALUE: customer.email, VALUE_TYPE: 'WORK' }] }
          : {}),
        ...(companyId ? { COMPANY_ID: companyId } : {}),
      },
      async () => {
        const sets: Set<number>[] = [];
        for (const [type, value] of [
          ['PHONE', customer.phone],
          ['EMAIL', customer.email],
        ]) {
          if (!value) continue;
          const { result } = await this.client.call<{ CONTACT?: unknown[] }>(
            'crm.duplicate.findbycomm',
            { entity_type: 'CONTACT', type, values: [value] },
          );
          const ids = new Set((result.CONTACT || []).map((id) => this.id(id)));
          if (ids.size) sets.push(ids);
        }
        if (!sets.length) return null;
        const matches = [...sets[0]].filter((id) =>
          sets.every((set) => set.has(id)),
        );
        if (matches.length !== 1) throw new Bitrix24Error('customer_ambiguous');
        return matches[0];
      },
    );
  }

  async sync(ticket: any, deal: any) {
    const { title, description, customer } = await this.describe(ticket);
    const notes = String(deal.COMMENTS || '');
    // Retain notes entered by CRM staff; retries must not append the same block twice.
    const comments = notes.includes(description)
      ? notes
      : [notes, description].filter(Boolean).join('\n\n');
    await this.updateDeal(Number(deal.ID), {
      TITLE: title,
      COMMENTS: comments,
    });
    const companyId =
      customer.companyId ||
      (Number(deal.COMPANY_ID) > 0
        ? this.id(deal.COMPANY_ID)
        : await this.company(customer.company));
    if (companyId && Number(deal.COMPANY_ID) !== companyId) {
      await this.updateDeal(Number(deal.ID), { COMPANY_ID: companyId });
    }
    const contactId = await this.contact(customer, companyId);
    if (contactId) {
      const { result: contacts } = await this.client.call<
        { CONTACT_ID: string }[]
      >('crm.deal.contact.items.get', { id: Number(deal.ID) });
      if (!contacts.some((item) => Number(item.CONTACT_ID) === contactId)) {
        await this.assertWritable();
        await this.client.call('crm.deal.contact.add', {
          id: Number(deal.ID),
          fields: {
            CONTACT_ID: contactId,
            IS_PRIMARY: contacts.length ? 'N' : 'Y',
          },
        });
      }
    }
    await this.store.collection('tickets').updateOne(
      { id: ticket.id },
      {
        $set: {
          'bitrix.customer_version': 1,
          'bitrix.customer_error_code': '',
        },
      },
    );
  }
}
