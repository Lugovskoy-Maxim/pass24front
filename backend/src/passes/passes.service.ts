import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessConfigService } from '../access/access-config.service';
import { AuditActor, AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { Office, OfficeDocument, Pass, PassDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { PropertyType } from '../schemas/enums';
import { deriveVisitPurpose, normalizePassport, normalizePersonName, normalizePhone } from '../common/pass-helpers';
import { assertVisitDateNotPast, isValidVisitDateString } from '../common/visit-date';
import { CreatePassDto } from './dto/create-pass.dto';
import { PassHistoryQueryDto } from './dto/pass-history-query.dto';
import { UpdatePassVisitorDto } from './dto/update-pass-visitor.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PassTemplatesService } from './pass-templates.service';

@Injectable()
export class PassesService implements OnModuleInit {
  constructor(
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    private accessConfigService: AccessConfigService,
    private passTemplatesService: PassTemplatesService,
    private auditService: AuditService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  private readonly passTypeLabels: Record<string, string> = {
    visitor: 'Посетитель',
    parking: 'Парковка',
    delivery: 'Доставка',
    contractor: 'Подрядчик',
  };

  private generatePassNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `Pass-${year}-${random}`;
  }

  async onModuleInit() {
    await this.expirePastPasses();
  }

  private getTodayDate() {
    return this.getLocalDateString();
  }

  private getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseTimeToMinutes(time: string) {
    const [h, m] = time.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(h)) return 0;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
  }

  private isPassOverdueInBuilding(pass: { status: string; visitDate: string; visitTimeTo?: string }, now = new Date()) {
    if (pass.status !== 'active') return false;

    const today = this.getLocalDateString(now);
    if (pass.visitDate < today) return true;

    if (pass.visitDate === today && pass.visitTimeTo) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      return currentMinutes > this.parseTimeToMinutes(pass.visitTimeTo);
    }

    return false;
  }

  async expirePastPasses() {
    const today = this.getTodayDate();
    const toExpire = await this.passModel
      .find({ visitDate: { $lt: today }, status: { $in: ['pending', 'approved'] } })
      .select('_id passNumber visitDate')
      .lean();

    if (toExpire.length) {
      await this.passModel.updateMany(
        { _id: { $in: toExpire.map((p) => p._id) } },
        { $set: { status: 'expired' } },
      );
      await Promise.all(
        toExpire.map((pass) =>
          this.auditService.log({
            action: 'pass.expired',
            entityType: 'pass',
            entityId: pass._id,
            details: { passNumber: pass.passNumber, visitDate: pass.visitDate },
          }),
        ),
      );
    }

    return toExpire.length;
  }

  private createdByFilter(userId: string) {
    return {
      $or: [
        { createdBy: userId },
        { createdBy: new Types.ObjectId(userId) },
      ],
    };
  }

  private async buildAccessFilter(user?: any) {
    if (!user?.role) return { _id: null };

    if (user.role === 'tenant') {
      return this.createdByFilter(user.userId);
    }

    if (await this.accessConfigService.canViewAllPasses(user.role)) {
      return {};
    }

    if (await this.accessConfigService.hasPermission(user.role, 'passes.view_own')) {
      return this.createdByFilter(user.userId);
    }

    return { _id: null };
  }

  async findAll(params: { status?: string; date?: string; search?: string }, user?: any) {
    await this.expirePastPasses();
    const filter: any = { ...(await this.buildAccessFilter(user)) };

    if (params.status) filter.status = params.status;
    if (params.date) filter.visitDate = params.date;

    if (params.search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { visitorName: new RegExp(params.search, 'i') },
          { visitorPhone: new RegExp(params.search, 'i') },
          { visitorPassportSeries: new RegExp(params.search, 'i') },
          { visitorPassportNumber: new RegExp(params.search, 'i') },
          { vehiclePlate: new RegExp(params.search, 'i') },
          { companyName: new RegExp(params.search, 'i') },
          { businessCenterName: new RegExp(params.search, 'i') },
        ],
      });
    }

    const passes = await this.passModel.find(filter).sort({ createdAt: -1 }).lean();
    const enriched = await this.enrichCreatorFields(passes, user);
    return { passes: enriched.map((p) => this.mapToFrontend(p, user)) };
  }

  async findOne(id: string, user?: any) {
    await this.expirePastPasses();
    const pass = await this.passModel.findById(id).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    await this.ensurePassAccess(pass, user);
    const [enriched] = await this.enrichCreatorFields([pass], user);
    return { pass: this.mapToFrontend(enriched, user) };
  }

  async create(dto: CreatePassDto, user: any) {
    const enabled = await this.accessConfigService.isPassTypeEnabled(dto.passType);
    if (!enabled) {
      throw new BadRequestException('Этот тип пропуска отключён администратором');
    }

    const { sendEmail, recipientEmail, ...passDto } = dto;
    if (sendEmail && !recipientEmail?.trim()) {
      throw new BadRequestException('Укажите email для отправки пропуска');
    }

    if (!isValidVisitDateString(passDto.visitDate)) {
      throw new BadRequestException('Некорректная дата визита');
    }
    try {
      assertVisitDateNotPast(passDto.visitDate, this.getTodayDate());
    } catch (e) {
      if (e instanceof Error && e.message === 'PAST_DATE') {
        throw new BadRequestException('Нельзя заказать пропуск на прошедшую дату');
      }
      throw new BadRequestException('Некорректная дата визита');
    }

    const resolved = await this.resolveOfficeFields(passDto, user);
    const creator = user?.userId
      ? await this.userModel.findById(user.userId).select('fullName phone company email').lean()
      : null;

    const passNumber = this.generatePassNumber();
    const approvedAt = new Date().toISOString();
    const doc = await this.passModel.create({
      ...passDto,
      visitPurpose: deriveVisitPurpose(passDto.passType),
      ...resolved,
      passNumber,
      status: 'approved',
      approvedAt,
      createdBy: user?.userId ? new Types.ObjectId(user.userId) : undefined,
      creatorName: creator?.fullName || user?.fullName || user?.email,
      creatorPhone: creator?.phone,
      creatorCompany: resolved.companyName || passDto.companyName || creator?.company,
    });

    if (user?.role === 'tenant') {
      await this.passTemplatesService.upsertFromPass(doc.toObject(), user.userId);
    }

    await this.auditService.log({
      action: 'pass.create',
      entityType: 'pass',
      entityId: doc._id,
      actor: user,
      details: { passNumber: doc.passNumber, visitorName: doc.visitorName, status: doc.status },
    });

    let emailSent = false;
    if (sendEmail && recipientEmail) {
      await this.sendPassEmail(doc._id.toString(), recipientEmail.trim(), user);
      emailSent = true;
    }

    return { pass: this.mapToFrontend(doc, user), emailSent };
  }

  async sendPassEmail(idOrNumber: string, email: string, user?: any) {
    const isObjectId = /^[a-f0-9]{24}$/i.test(idOrNumber);
    let pass = isObjectId ? await this.passModel.findById(idOrNumber).lean() : null;
    if (!pass) {
      pass = await this.passModel.findOne({ passNumber: idOrNumber }).lean();
    }
    if (!pass) throw new NotFoundException('Пропуск не найден');
    await this.ensurePassAccess(pass, user);

    const ticketUrl = this.buildTicketUrl(pass.passNumber);
    await this.mailService.sendPassTicket({
      to: email.trim().toLowerCase(),
      visitorName: pass.visitorName,
      passNumber: pass.passNumber,
      visitDate: pass.visitDate,
      visitTimeFrom: pass.visitTimeFrom,
      visitTimeTo: pass.visitTimeTo,
      businessCenterName: pass.businessCenterName,
      office: pass.office,
      floor: pass.floor,
      companyName: pass.companyName,
      visitPurpose: pass.visitPurpose,
      passTypeLabel: this.passTypeLabels[pass.passType] || pass.passType,
      ticketUrl,
    });

    return { sent: true, email: email.trim().toLowerCase() };
  }

  private buildTicketUrl(passNumber: string) {
    const base = (this.configService.get<string>('PUBLIC_APP_URL') || 'http://127.0.0.1:3000').replace(/\/$/, '');
    return `${base}/ticket/${encodeURIComponent(passNumber)}`;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, actor?: AuditActor) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    const canApprove = actor?.role
      ? await this.accessConfigService.hasPermission(actor.role, 'passes.approve')
      : false;
    const canReception = actor?.role
      ? await this.accessConfigService.hasPermission(actor.role, 'passes.reception')
      : false;
    const isCreator = actor?.userId && pass.createdBy?.toString() === actor.userId;

    if (dto.status === 'cancelled') {
      if (!canApprove && !isCreator) {
        throw new ForbiddenException('Нельзя отменить этот пропуск');
      }
      if (!canApprove && !['pending', 'approved'].includes(pass.status)) {
        throw new BadRequestException('Можно отменить только до входа в здание');
      }
    } else if (dto.status === 'rejected') {
      if (!canApprove && !canReception) {
        throw new ForbiddenException('Недостаточно прав для отклонения пропуска');
      }
      if (!['pending', 'approved'].includes(pass.status)) {
        throw new BadRequestException('Можно отклонить только до входа в здание');
      }
    } else if (!canApprove) {
      throw new ForbiddenException('Недостаточно прав для изменения статуса');
    }

    pass.status = dto.status;
    if (dto.rejectionReason) pass.rejectionReason = dto.rejectionReason;

    if (dto.status === 'approved') {
      pass.approvedAt = new Date().toISOString();
      pass.approverName = actor?.email || 'admin';
    }

    await pass.save();

    const statusActions: Record<string, string> = {
      approved: 'pass.approved',
      rejected: 'pass.rejected',
      cancelled: 'pass.cancelled',
    };
    const action = statusActions[dto.status];
    if (action) {
      await this.auditService.log({
        action,
        entityType: 'pass',
        entityId: pass._id,
        actor,
        details: {
          passNumber: pass.passNumber,
          status: dto.status,
          rejectionReason: dto.rejectionReason,
        },
      });
    }

    return { pass: this.mapToFrontend(pass, actor) };
  }

  async checkIn(id: string, actor?: AuditActor) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');
    if (!['pending', 'approved'].includes(pass.status)) {
      throw new BadRequestException('Пропуск нельзя впустить в текущем статусе');
    }

    if (pass.status === 'pending' && !pass.approvedAt) {
      pass.approvedAt = new Date().toISOString();
    }

    pass.status = 'active';
    pass.checkedInAt = new Date().toISOString();
    await pass.save();

    await this.auditService.log({
      action: 'pass.check_in',
      entityType: 'pass',
      entityId: pass._id,
      actor,
      details: { passNumber: pass.passNumber, visitorName: pass.visitorName },
    });

    return { pass: this.mapToFrontend(pass) };
  }

  async checkOut(id: string, actor?: AuditActor) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = 'completed';
    pass.checkedOutAt = new Date().toISOString();
    await pass.save();

    await this.auditService.log({
      action: 'pass.check_out',
      entityType: 'pass',
      entityId: pass._id,
      actor,
      details: { passNumber: pass.passNumber, visitorName: pass.visitorName },
    });

    return { pass: this.mapToFrontend(pass) };
  }

  async getJournal(date?: string, user?: any) {
    await this.expirePastPasses();
    const targetDate = date || this.getTodayDate();
    const accessFilter = await this.buildAccessFilter(user);

    const passes = await this.passModel
      .find({ visitDate: targetDate, ...accessFilter })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = await this.enrichCreatorFields(passes, user);
    const mapped = enriched.map((p) => this.mapToFrontend(p, user));
    const stats = {
      total: mapped.length,
      pending: mapped.filter((p) => p.status === 'pending').length,
      active: mapped.filter((p) => p.status === 'active').length,
      completed: mapped.filter((p) => p.status === 'completed').length,
      approved: mapped.filter((p) => p.status === 'approved' || p.status === 'pending').length,
    };

    return { date: targetDate, stats, passes: mapped };
  }

  async getHistory(query: PassHistoryQueryDto, user?: any) {
    await this.expirePastPasses();
    const accessFilter = await this.buildAccessFilter(user);
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
    const filter: any = { ...accessFilter };

    switch (query.scope) {
      case 'office': {
        if (!query.officeId) throw new BadRequestException('Укажите officeId');
        filter.officeId = new Types.ObjectId(query.officeId);
        break;
      }
      case 'company': {
        if (!query.companyName?.trim()) throw new BadRequestException('Укажите companyName');
        filter.companyName = new RegExp(`^${this.escapeRegex(query.companyName.trim())}$`, 'i');
        break;
      }
      case 'bc': {
        if (!query.propertyId) throw new BadRequestException('Укажите propertyId');
        filter.property = new Types.ObjectId(query.propertyId);
        break;
      }
      case 'visitor':
      default: {
        const or: any[] = [];
        const name = query.visitorName?.trim();
        if (name) {
          or.push({ visitorName: new RegExp(`^${this.escapeRegex(name)}$`, 'i') });
        }
        const phone = normalizePhone(query.visitorPhone);
        if (phone) {
          const phonePattern = phone.replace(/(\d)/g, '[\\s\\-()]*$1');
          or.push({ visitorPhone: new RegExp(phonePattern) });
        }
        if (query.visitorPassportNumber?.trim()) {
          or.push({ visitorPassportNumber: new RegExp(this.escapeRegex(query.visitorPassportNumber.trim())) });
        }
        if (query.visitorPassportSeries?.trim()) {
          or.push({ visitorPassportSeries: new RegExp(this.escapeRegex(query.visitorPassportSeries.trim()), 'i') });
        }
        if (!or.length) {
          throw new BadRequestException('Укажите ФИО, телефон или паспортные данные');
        }
        filter.$or = or;
        break;
      }
    }

    const passes = await this.passModel
      .find(filter)
      .sort({ visitDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const enriched = await this.enrichCreatorFields(passes, user);
    return {
      scope: query.scope,
      total: enriched.length,
      passes: enriched.map((p) => this.mapToFrontend(p, user)),
    };
  }

  async updateVisitorData(id: string, dto: UpdatePassVisitorDto, actor?: AuditActor) {
    if (!actor?.role) throw new ForbiddenException('Недостаточно прав');

    const canEdit =
      await this.accessConfigService.hasPermission(actor.role, 'passes.reception')
      || await this.accessConfigService.hasPermission(actor.role, 'passes.approve')
      || await this.accessConfigService.hasPermission(actor.role, 'admin.panel');

    if (!canEdit) {
      throw new ForbiddenException('Паспортные данные может вносить только ресепшн или администратор');
    }

    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    if (dto.visitorPassportSeries !== undefined) {
      pass.visitorPassportSeries = dto.visitorPassportSeries.trim() || undefined;
    }
    if (dto.visitorPassportNumber !== undefined) {
      pass.visitorPassportNumber = dto.visitorPassportNumber.trim() || undefined;
    }
    if (dto.visitorPassportIssuedBy !== undefined) {
      pass.visitorPassportIssuedBy = dto.visitorPassportIssuedBy.trim() || undefined;
    }

    await pass.save();

    await this.auditService.log({
      action: 'pass.visitor_data_updated',
      entityType: 'pass',
      entityId: pass._id,
      actor,
      details: {
        passNumber: pass.passNumber,
        visitorName: pass.visitorName,
        hasPassport: !!(pass.visitorPassportSeries || pass.visitorPassportNumber),
      },
    });

    return { pass: this.mapToFrontend(pass, actor) };
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async lookup(passNumber: string, user?: any) {
    await this.expirePastPasses();
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    const [enriched] = await this.enrichCreatorFields([pass], user || { role: 'security' });
    return { pass: this.mapToFrontend(enriched, user) };
  }

  async getPublicTicket(passNumber: string) {
    await this.expirePastPasses();
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    const businessCenterName = await this.resolveBusinessCenterName(pass);
    return { ticket: { ...this.mapToPublicTicket(pass), businessCenterName } };
  }

  async getOverdueActive(user?: any) {
    await this.expirePastPasses();
    const accessFilter = await this.buildAccessFilter(user);
    const passes = await this.passModel
      .find({ status: 'active', ...accessFilter })
      .sort({ visitDate: 1, visitTimeTo: 1 })
      .lean();

    const overdue = passes.filter((p) => this.isPassOverdueInBuilding(p));
    const enriched = await this.enrichCreatorFields(overdue, user);
    return {
      count: enriched.length,
      passes: enriched.map((p) => this.mapToFrontend(p, user)),
    };
  }

  async getStats(user?: any) {
    await this.expirePastPasses();
    const today = this.getTodayDate();
    const accessFilter = await this.buildAccessFilter(user);
    const passes = await this.passModel.find(accessFilter).lean();
    const todayPasses = passes.filter((p) => p.visitDate === today);

    return {
      today,
      todayCount: todayPasses.length,
      weekCount: passes.length,
      byStatus: this.countBy(passes, 'status'),
      todayByType: this.countBy(todayPasses, 'passType'),
    };
  }

  private async resolveOfficeFields(dto: CreatePassDto, user: any) {
    if (dto.officeId) {
      const office = await this.officeModel.findById(dto.officeId).lean();
      if (!office || !office.isActive) {
        throw new NotFoundException('Офис не найден');
      }

      if (user.role === 'tenant') {
        const ownsOffice =
          office.tenantId?.toString() === user.userId;
        if (!ownsOffice) {
          throw new ForbiddenException('Вы можете заказывать пропуска только в свои офисы');
        }
      }

      const property = await this.propertyModel.findById(office.property).lean();
      return {
        officeId: office._id,
        property: office.property,
        businessCenterName: property?.name,
        office: office.number,
        floor: office.floor,
        companyName: dto.companyName || office.company,
      };
    }

    if (!dto.office?.trim()) {
      throw new BadRequestException('Укажите офис из реестра');
    }

    const officeNumber = dto.office.trim();
    const office = await this.officeModel.findOne({ number: officeNumber, isActive: true }).lean();
    if (office) {
      const property = await this.propertyModel.findById(office.property).lean();
      return {
        officeId: office._id,
        property: office.property,
        businessCenterName: property?.name,
        office: office.number,
        floor: dto.floor || office.floor,
        companyName: dto.companyName || office.company,
      };
    }

    const defaultProperty = await this.getDefaultBusinessCenter();
    return {
      office: officeNumber,
      floor: dto.floor,
      property: defaultProperty?._id,
      businessCenterName: defaultProperty?.name,
    };
  }

  private async getDefaultBusinessCenter() {
    return this.propertyModel
      .findOne({ type: PropertyType.BUSINESS_CENTER, isActive: true })
      .sort({ createdAt: 1 })
      .lean();
  }

  private async resolveBusinessCenterName(doc: any): Promise<string | undefined> {
    if (doc.businessCenterName) return doc.businessCenterName;

    if (doc.property) {
      const property = await this.propertyModel.findById(doc.property).lean();
      if (property?.name) return property.name;
    }

    if (doc.officeId) {
      const office = await this.officeModel.findById(doc.officeId).lean();
      if (office?.property) {
        const property = await this.propertyModel.findById(office.property).lean();
        if (property?.name) return property.name;
      }
    }

    if (doc.office) {
      const office = await this.officeModel.findOne({ number: String(doc.office), isActive: true }).lean();
      if (office?.property) {
        const property = await this.propertyModel.findById(office.property).lean();
        if (property?.name) return property.name;
      }
    }

    const defaultProperty = await this.getDefaultBusinessCenter();
    return defaultProperty?.name;
  }

  private async ensurePassAccess(pass: any, user?: any) {
    if (!user?.role) throw new ForbiddenException('Нет доступа к этому пропуску');

    if (user.role === 'tenant') {
      const isCreator = pass.createdBy?.toString() === user.userId;
      if (!isCreator) throw new ForbiddenException('Нет доступа к этому пропуску');
      return;
    }

    if (await this.accessConfigService.canViewAllPasses(user.role)) return;

    const isCreator = pass.createdBy?.toString() === user.userId;
    if (isCreator && await this.accessConfigService.hasPermission(user.role, 'passes.view_own')) return;

    throw new ForbiddenException('Нет доступа к этому пропуску');
  }

  private countBy(arr: any[], key: string) {
    return arr.reduce((acc, item) => {
      const val = item[key] || 'unknown';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private mapToPublicTicket(doc: any) {
    return {
      passNumber: doc.passNumber,
      visitorName: doc.visitorName,
      companyName: doc.companyName,
      visitPurpose: doc.visitPurpose,
      passType: doc.passType,
      vehiclePlate: doc.vehiclePlate,
      visitDate: doc.visitDate,
      visitTimeFrom: doc.visitTimeFrom,
      visitTimeTo: doc.visitTimeTo,
      businessCenterName: doc.businessCenterName,
      office: doc.office,
      floor: doc.floor,
      status: doc.status,
      createdAt: doc.createdAt,
      approvedAt: doc.approvedAt,
      checkedInAt: doc.checkedInAt,
      checkedOutAt: doc.checkedOutAt,
      rejectionReason: doc.rejectionReason,
    };
  }

  private async enrichCreatorFields(docs: any[], viewer?: any) {
    if (!docs.length || viewer?.role === 'tenant') return docs;

    const creatorIds = [
      ...new Set(
        docs
          .map((doc) => doc.createdBy?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    if (!creatorIds.length) return docs;

    const creators = await this.userModel
      .find({ _id: { $in: creatorIds.map((id) => new Types.ObjectId(id)) } })
      .select('fullName phone company')
      .lean();
    const creatorMap = new Map(creators.map((u) => [u._id.toString(), u]));

    return docs.map((doc) => {
      const creator = doc.createdBy ? creatorMap.get(doc.createdBy.toString()) : null;
      if (!creator) return doc;
      return {
        ...doc,
        creatorName: doc.creatorName || creator.fullName,
        creatorPhone: doc.creatorPhone || creator.phone,
        creatorCompany: doc.creatorCompany || creator.company,
      };
    });
  }

  private mapToFrontend(doc: any, user?: any) {
    const isTenant = user?.role === 'tenant';
    const isOwner = !!user?.userId && doc.createdBy?.toString() === user.userId;
    return {
      id: doc._id.toString(),
      passNumber: doc.passNumber,
      isOwner,
      createdBy: isOwner || !isTenant ? doc.createdBy?.toString() || '' : '',
      creatorName: isTenant ? undefined : doc.creatorName,
      creatorCompany: isTenant ? undefined : doc.creatorCompany,
      creatorPhone: isTenant ? undefined : doc.creatorPhone,
      visitorName: doc.visitorName,
      visitorPhone: doc.visitorPhone,
      visitorPassportSeries: doc.visitorPassportSeries,
      visitorPassportNumber: doc.visitorPassportNumber,
      visitorPassportIssuedBy: doc.visitorPassportIssuedBy,
      companyName: doc.companyName,
      visitPurpose: doc.visitPurpose,
      passType: doc.passType,
      vehiclePlate: doc.vehiclePlate,
      vehicleModel: doc.vehicleModel,
      visitDate: doc.visitDate,
      visitTimeFrom: doc.visitTimeFrom,
      visitTimeTo: doc.visitTimeTo,
      propertyId: doc.property?.toString(),
      officeId: doc.officeId?.toString(),
      businessCenterName: doc.businessCenterName,
      office: doc.office,
      floor: doc.floor,
      comment: doc.comment,
      status: doc.status,
      approvedBy: doc.approvedBy,
      approverName: doc.approverName,
      approvedAt: doc.approvedAt,
      rejectionReason: doc.rejectionReason,
      checkedInAt: doc.checkedInAt,
      checkedInBy: doc.checkedInBy,
      checkerInName: doc.checkerInName,
      checkedOutAt: doc.checkedOutAt,
      checkedOutBy: doc.checkedOutBy,
      checkerOutName: doc.checkerOutName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}