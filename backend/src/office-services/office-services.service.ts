import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ClientSession, ObjectId } from 'mongodb';
import { Office, OfficeDocument, User, UserDocument } from '../schemas';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { officeAssignedToQuery } from '../common/office-tenants';
import { AuditService } from '../audit/audit.service';
import {
  categoryInput,
  DEFAULT_OFFICE_CATEGORIES,
  detailsInput,
  effectiveRule,
  invalid,
  normalizeOfficeCategory,
  num,
  object,
  serviceInput,
  visibleOfficeValues,
} from './office-services.rules';

@Injectable()
export class OfficeServicesService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Office.name) private readonly offices: Model<OfficeDocument>,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly users: Model<UserDocument>,
    private readonly audit: AuditService,
  ) {}
  private collection(name: string) {
    return this.connection.db!.collection<any>(name);
  }
  async onModuleInit() {
    await this.collection('office_categories').createIndex(
      { code: 1 },
      { unique: true },
    );
    for (const category of DEFAULT_OFFICE_CATEGORIES)
      await this.collection('office_categories').updateOne(
        { code: category.code },
        { $setOnInsert: category },
        { upsert: true },
      );
    await this.collection('office_service_prices').createIndex({
      propertyId: 1,
      active: 1,
      order: 1,
    });
  }
  private id(value: string) {
    if (!/^[a-f\d]{24}$/i.test(value)) invalid('Некорректный идентификатор');
    return new ObjectId(value);
  }
  assertProperty(user: any, propertyId?: string | null, writeGlobal = false) {
    if (user.role === 'admin') return;
    if (!propertyId) {
      if (!writeGlobal) return;
      throw new ForbiddenException(
        'Общие условия изменяет главный администратор',
      );
    }
    if (
      !(user.propertyIds || user.properties || [])
        .map(String)
        .includes(String(propertyId))
    )
      throw new ForbiddenException('Нет доступа к этому БЦ');
  }
  async categories() {
    const configured = await this.collection('office_categories')
      .find({}, { projection: { _id: 0 } })
      .sort({ order: 1, code: 1 })
      .toArray();
    const known = new Set(configured.map((c) => c.code));
    const codes = await this.offices.distinct('officeFormat');
    return {
      categories: [
        ...configured,
        ...[...new Set(codes.map(normalizeOfficeCategory))]
          .filter((code) => code && !known.has(code))
          .map((code) => ({ code, name: code, color: '#64748b', order: 1000 })),
      ],
    };
  }
  async category(code?: string) {
    const normalized = normalizeOfficeCategory(code);
    if (!normalized) return null;
    return (
      (await this.collection('office_categories').findOne(
        { code: normalized },
        { projection: { _id: 0 } },
      )) || { code: normalized, name: code, color: '#64748b', order: 1000 }
    );
  }
  async saveCategory(body: any, user: any) {
    if (user.role !== 'admin')
      throw new ForbiddenException(
        'Категории настраивает главный администратор',
      );
    const value = categoryInput(body);
    await this.collection('office_categories').updateOne(
      { code: value.code },
      { $set: value },
      { upsert: true },
    );
    await this.audit.log({
      action: 'office.category_updated',
      entityType: 'office_category',
      entityId: value.code,
      actor: user,
      details: value,
    });
    return value;
  }
  private presentService(value: any) {
    const { _id, ...rest } = value;
    return { ...rest, id: String(_id) };
  }
  async prices(user: any) {
    const query =
      user.role === 'admin'
        ? {}
        : {
            $or: [
              { propertyId: null },
              {
                propertyId: {
                  $in: (user.propertyIds || user.properties || []).map(String),
                },
              },
            ],
          };
    return {
      services: (
        await this.collection('office_service_prices')
          .find(query)
          .sort({ order: 1, name: 1 })
          .toArray()
      ).map((s) => this.presentService(s)),
    };
  }
  async savePrice(id: string | null, body: any, user: any) {
    const value = serviceInput(body);
    if (value.propertyId) this.id(value.propertyId);
    this.assertProperty(user, value.propertyId, true);
    const categories = new Set(
      (await this.categories()).categories.map((c) => c.code),
    );
    if (value.rules.some((r) => !categories.has(r.categoryCode)))
      invalid('Неизвестная категория');
    const collection = this.collection('office_service_prices');
    const _id = id ? this.id(id) : new ObjectId();
    if (id) {
      const previous = await collection.findOne({ _id });
      if (!previous) throw new NotFoundException('Услуга не найдена');
      this.assertProperty(user, previous.propertyId, true);
      const updated = await collection.updateOne(
        { _id, revision: num(body.revision, 2147483647, 1) },
        { $set: { ...value, updatedAt: new Date() }, $inc: { revision: 1 } },
      );
      if (!updated.matchedCount)
        throw new ConflictException('Прайс изменился. Обновите страницу');
    } else
      await collection.insertOne({
        _id,
        ...value,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await this.audit.log({
      action: 'office.price_saved',
      entityType: 'office_service',
      entityId: String(_id),
      actor: user,
      details: { name: value.name },
    });
    return { service: this.presentService(await collection.findOne({ _id })) };
  }
  async adminOffice(id: string, user: any) {
    const office = await this.offices.findById(this.id(id)).lean();
    if (!office) throw new NotFoundException('Офис не найден');
    this.assertProperty(user, String(office.property));
    return {
      office: {
        id,
        propertyId: String(office.property),
        officeFormat: normalizeOfficeCategory(office.officeFormat),
        category: await this.category(office.officeFormat),
        externalId: office.externalId,
        revision: office.serviceRevision || 0,
        details: {
          values: office.serviceDetails?.values ?? {},
          visibleFields: office.serviceDetails?.visibleFields ?? [],
          serviceOverrides: office.serviceDetails?.serviceOverrides ?? [],
        },
      },
    };
  }
  async saveOffice(id: string, body: any, user: any) {
    object(body, ['details', 'officeFormat', 'revision']);
    const { office } = await this.adminOffice(id, user);
    const details = detailsInput(body.details);
    const officeFormat =
      body.officeFormat == null
        ? office.officeFormat
        : normalizeOfficeCategory(body.officeFormat);
    if (office.externalId && officeFormat !== office.officeFormat)
      throw new ConflictException(
        'Категория связанного офиса изменяется на сайте-источнике',
      );
    if (
      officeFormat &&
      !(await this.categories()).categories.some((c) => c.code === officeFormat)
    )
      invalid('Неизвестная категория');
    for (const rule of details.serviceOverrides) {
      const service = await this.collection('office_service_prices').findOne({
        _id: this.id(rule.serviceId!),
      });
      if (!service) invalid('Неизвестная услуга');
      if (service.bookingRoomIds?.length && rule.unit !== 'hour')
        invalid('Для переговорной укажите расчёт по часам');
      const original = await this.offices.findById(id).lean();
      if (
        service.propertyId &&
        service.propertyId !== String(original!.property)
      )
        invalid('Услуга относится к другому БЦ');
    }
    const original = await this.offices.findById(id).lean();
    const revision = num(body.revision ?? 0, 2147483647);
    const result = await this.offices.updateOne(
      {
        _id: id,
        serviceRevision: revision === 0 ? { $in: [0, null] } : revision,
      },
      {
        $set: { serviceDetails: details, officeFormat },
        $inc: { serviceRevision: 1 },
      },
    );
    if (!result.matchedCount)
      throw new ConflictException(
        'Информация изменена другим администратором. Обновите карточку',
      );
    await this.audit.log({
      action: 'office.services_updated',
      entityType: 'office',
      entityId: id,
      actor: user,
      details: {
        visibleFields: details.visibleFields,
        previousRevision: original?.serviceRevision || 0,
      },
    });
    return this.adminOffice(id, user);
  }
  async features(office: any, session?: ClientSession) {
    const visible = new Set(office.serviceDetails?.visibleFields || []);
    const category = visible.has('category')
      ? await this.category(office.officeFormat)
      : null;
    const services = visible.has('services')
      ? await this.effectiveServices(office, session)
      : [];
    return {
      category,
      details: visibleOfficeValues(office.serviceDetails),
      services,
      serviceRevision: office.serviceRevision || 0,
    };
  }
  async tenantOffice(id: string, user: any) {
    const person = await this.users
      .findById(user.userId)
      .select('parentTenantId')
      .lean();
    const ownerId = person?.parentTenantId?.toString() || user.userId;
    const office = await this.offices
      .findOne({
        _id: this.id(id),
        ...officeAssignedToQuery(ownerId),
        isActive: true,
      })
      .lean();
    if (!office) throw new NotFoundException('Офис не найден');
    return {
      office: { id, number: office.number, ...(await this.features(office)) },
    };
  }
  async effectiveServices(office: any, session?: ClientSession) {
    const services = await this.collection('office_service_prices')
      .find(
        {
          active: true,
          $or: [{ propertyId: null }, { propertyId: String(office.property) }],
        },
        { session },
      )
      .sort({ order: 1, name: 1 })
      .toArray();
    return services.flatMap((service) => {
      const rule = effectiveRule(service, office);
      return rule?.show
        ? [
            {
              id: String(service._id),
              name: service.name,
              description: service.description,
              revision: service.revision,
              bookingRoomIds: service.bookingRoomIds,
              ...rule,
            },
          ]
        : [];
    });
  }
  async officeForProfile(
    profile: any,
    officeId: string | undefined,
    session?: ClientSession,
  ) {
    const ids: string[] = profile.officeIds || [];
    const linked = await this.offices
      .find({
        $or: [
          { externalId: { $in: ids } },
          { _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)) } },
        ],
        isActive: true,
      })
      .session(session || null)
      .lean();
    if (officeId) {
      const selected = linked.find(
        (o) => String(o._id) === officeId || o.externalId === officeId,
      );
      if (!selected)
        throw new ForbiddenException('Офис не относится к выбранному профилю');
      return selected;
    }
    if (linked.length > 1) invalid('Выберите офис для заявки');
    return linked[0] || null;
  }
  async serviceOrder(
    office: any,
    serviceId: string,
    quantity: number,
    session?: ClientSession,
  ) {
    if (!office?.serviceDetails?.visibleFields?.includes('services'))
      throw new ForbiddenException('Услуги офиса недоступны');
    const service = (await this.effectiveServices(office, session)).find(
      (s) => s.id === serviceId,
    );
    if (!service || !service.orderable || service.mode === 'unavailable')
      invalid('Услуга недоступна для заказа');
    if (service.bookingRoomIds?.length)
      invalid('Для этой услуги используйте бронирование переговорной');
    const qty = num(quantity, 1000, 1);
    return {
      ...service,
      quantity: qty,
      totalAmountMinor:
        service.mode === 'included'
          ? 0
          : ['quota', 'request'].includes(service.mode) ||
              service.priceMinor == null
            ? null
            : service.priceMinor * qty,
    };
  }
  async monthlyHours(
    profile: any,
    session?: ClientSession,
  ): Promise<number | null> {
    const ids = profile.officeIds || [];
    const offices = await this.offices
      .find({
        $or: [
          { externalId: { $in: ids } },
          {
            _id: {
              $in: ids.filter((id: string) => Types.ObjectId.isValid(id)),
            },
          },
        ],
        isActive: true,
      })
      .session(session || null)
      .lean();
    let quota: number | null = null;
    for (const office of offices) {
      const services = await this.collection('office_service_prices')
        .find(
          {
            $or: [
              { propertyId: null },
              { propertyId: String(office.property) },
            ],
            'bookingRoomIds.0': { $exists: true },
          },
          { session },
        )
        .toArray();
      for (const service of services) {
        quota ??= 0;
        const rule = effectiveRule(service, office);
        if (
          service.active &&
          rule?.show &&
          rule.orderable &&
          rule.mode === 'quota'
        )
          quota = Math.max(quota, rule.freeMinutes);
      }
    }
    return quota;
  }
  async bookingCatalog(catalog: any, profile: any, officeId?: string) {
    const office = await this.officeForProfile(profile, officeId);
    if (!office) return catalog;
    const services = await this.collection('office_service_prices')
      .find({
        $or: [{ propertyId: null }, { propertyId: String(office.property) }],
      })
      .toArray();
    const snapshot: any[] = [];
    const rooms = catalog.rooms.flatMap((room: any) => {
      const configured = services.filter((s) =>
        s.bookingRoomIds?.includes(room.id),
      );
      if (!configured.length) return [room];
      const linked = configured.filter((s) => s.active);
      if (!linked.length) return [];
      if (!office.serviceDetails?.visibleFields?.includes('services'))
        return [];
      if (linked.length > 1)
        invalid(
          'Для переговорной назначены несколько тарифов. Обратитесь к администратору',
        );
      const service = linked[0];
      const rule = effectiveRule(service, office);
      if (
        !rule ||
        !rule.show ||
        !rule.orderable ||
        ['unavailable', 'request'].includes(rule.mode)
      )
        return [];
      snapshot.push({
        id: String(service._id),
        revision: service.revision,
        rule,
        officeRevision: office.serviceRevision || 0,
      });
      return [
        {
          ...room,
          office_service: {
            id: String(service._id),
            name: service.name,
            ...rule,
          },
          config: {
            ...room.config,
            price_unit: 'hour',
            price_amount_minor: rule.mode === 'included' ? 0 : rule.priceMinor,
            price_label:
              rule.mode === 'included'
                ? 'Включено'
                : `${(rule.priceMinor || 0) / 100} ₽/час`,
          },
        },
      ];
    });
    return {
      ...catalog,
      rooms,
      version: `${catalog.version}:office:${String(office._id)}:${JSON.stringify(snapshot)}`,
      office_id: String(office._id),
    };
  }
}
