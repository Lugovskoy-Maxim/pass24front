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
import { resolveTenantOwnerId, tenantOwnerObjectId } from '../common/tenant-owner';
import { isTenantCompanyUser } from '../common/tenant-account';
import { userHasPermission } from '../common/user-permissions';
import { assertVisitDateBookable, parseClosedWeekdays } from '../common/bookable-visit-dates';
import { isValidVisitDateString } from '../common/visit-date';
import { buildPassCsv } from '../common/pass-csv';
import { CreatePassDto } from './dto/create-pass.dto';
import { PassExportQueryDto } from './dto/pass-export-query.dto';
import { PassHistoryQueryDto } from './dto/pass-history-query.dto';
import { UpdatePassVisitorDto } from './dto/update-pass-visitor.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PassTemplatesService } from './pass-templates.service';

const PASS_EXPORT_LIMIT = 10_000;
const PASS_REPORT_PAGE_SIZE = 50;

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

  private createdByTeamFilter(userIds: Types.ObjectId[]) {
    return { createdBy: { $in: userIds } };
  }

  private async getTenantTeamIds(user?: { userId?: string; parentTenantId?: string }) {
    const ownerId = resolveTenantOwnerId(user);
    if (!ownerId) return [];

    const team = await this.userModel
      .find({
        $or: [
          { _id: new Types.ObjectId(ownerId) },
          { parentTenantId: new Types.ObjectId(ownerId), isActive: { $ne: false } },
        ],
      })
      .select('_id')
      .lean();

    return team.map((member) => member._id as Types.ObjectId);
  }

  private async buildAccessFilter(user?: any) {
    if (!user?.role) return { _id: null };

    if (isTenantCompanyUser(user)) {
      const teamIds = await this.getTenantTeamIds(user);
      if (!teamIds.length) return { _id: null };

      if (user.parentTenantId) {
        if (userHasPermission(user, 'passes.view_own')) {
          return this.createdByFilter(user.userId);
        }
        return { _id: null };
      }

      return this.createdByTeamFilter(teamIds);
    }

    if (await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId)) {
      return {};
    }

    if (user.permissions?.length) {
      if (userHasPermission(user, 'passes.view_own')) {
        return this.createdByFilter(user.userId);
      }
      return { _id: null };
    }

    if (await this.accessConfigService.hasPermission(user.role, 'passes.view_own')) {
      return this.createdByFilter(user.userId);
    }

    return { _id: null };
  }

  private appendSearchFilter(filter: any, search?: string) {
    if (!search?.trim()) return;
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { visitorName: new RegExp(search, 'i') },
        { visitorPhone: new RegExp(search, 'i') },
        { visitorPassportSeries: new RegExp(search, 'i') },
        { visitorPassportNumber: new RegExp(search, 'i') },
        { vehiclePlate: new RegExp(search, 'i') },
        { companyName: new RegExp(search, 'i') },
        { businessCenterName: new RegExp(search, 'i') },
        { office: new RegExp(search, 'i') },
        { passNumber: new RegExp(search, 'i') },
      ],
    });
  }

  private async assertTenantExportScope(user: any, params: { propertyId?: string; officeId?: string }) {
    const ownerId = resolveTenantOwnerId(user);
    if (!ownerId) throw new ForbiddenException('Нет доступа');

    const offices = await this.officeModel
      .find({ tenantId: new Types.ObjectId(ownerId), isActive: true })
      .select('_id property')
      .lean();

    const officeIds = new Set(offices.map((o) => o._id.toString()));
    const propertyIds = new Set(
      offices.map((o) => o.property?.toString()).filter((id): id is string => !!id),
    );

    if (params.officeId && !officeIds.has(params.officeId)) {
      throw new ForbiddenException('Нет доступа к выбранному офису');
    }
    if (params.propertyId && !propertyIds.has(params.propertyId)) {
      throw new ForbiddenException('Нет доступа к выбранному БЦ');
    }
  }

  private async buildListFilter(
    params: {
      status?: string;
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      passType?: string;
      propertyId?: string;
      officeId?: string;
      tenantId?: string;
    },
    user?: any,
  ) {
    const filter: any = { ...(await this.buildAccessFilter(user)) };

    if (params.status) filter.status = params.status;
    if (params.passType) filter.passType = params.passType;

    if (params.dateFrom || params.dateTo) {
      if (params.dateFrom && !isValidVisitDateString(params.dateFrom)) {
        throw new BadRequestException('Некорректная дата «с»');
      }
      if (params.dateTo && !isValidVisitDateString(params.dateTo)) {
        throw new BadRequestException('Некорректная дата «по»');
      }
      if (params.dateFrom && params.dateTo && params.dateFrom > params.dateTo) {
        throw new BadRequestException('Дата «с» не может быть позже даты «по»');
      }
      filter.visitDate = {};
      if (params.dateFrom) filter.visitDate.$gte = params.dateFrom;
      if (params.dateTo) filter.visitDate.$lte = params.dateTo;
    } else if (params.date) {
      if (!isValidVisitDateString(params.date)) {
        throw new BadRequestException('Некорректная дата визита');
      }
      filter.visitDate = params.date;
    }

    this.appendSearchFilter(filter, params.search);

    if (params.propertyId || params.officeId) {
      if (isTenantCompanyUser(user)) {
        await this.assertTenantExportScope(user, params);
      }
      if (params.propertyId) filter.property = new Types.ObjectId(params.propertyId);
      if (params.officeId) filter.officeId = new Types.ObjectId(params.officeId);
    }

    if (params.tenantId) {
      if (isTenantCompanyUser(user)) {
        throw new ForbiddenException('Фильтр по арендатору недоступен');
      }
      if (!(await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId))) {
        throw new ForbiddenException('Нет доступа к фильтру по арендатору');
      }
      filter.createdBy = new Types.ObjectId(params.tenantId);
    }

    return filter;
  }

  async findAll(params: { status?: string; date?: string; search?: string }, user?: any) {
    await this.expirePastPasses();
    const filter = await this.buildListFilter(params, user);

    const passes = await this.passModel.find(filter).sort({ createdAt: -1 }).lean();
    const withCheckout = await this.enrichPassCheckoutSettings(passes);
    const enriched = await this.enrichCreatorFields(withCheckout, user);
    return { passes: enriched.map((p) => this.mapToFrontend(p, user)) };
  }

  async getExportFilters(user?: any) {
    const canFilterTenants = !isTenantCompanyUser(user)
      && !!(await this.accessConfigService.canViewAllPasses(user?.role, user?.parentTenantId));

    if (isTenantCompanyUser(user)) {
      const ownerId = resolveTenantOwnerId(user);
      const offices = ownerId
        ? await this.officeModel.find({ tenantId: new Types.ObjectId(ownerId), isActive: true }).lean()
        : [];
      const propertyIds = [...new Set(offices.map((o) => o.property?.toString()).filter((id): id is string => !!id))];
      const properties = propertyIds.length
        ? await this.propertyModel.find({ _id: { $in: propertyIds.map((id) => new Types.ObjectId(id)) } }).select('name').lean()
        : [];
      const propertyMap = new Map(properties.map((p) => [p._id.toString(), p.name]));

      return {
        scope: 'own' as const,
        businessCenters: propertyIds.map((id) => ({ id, name: propertyMap.get(id) || 'БЦ' })),
        offices: offices.map((o) => ({
          id: o._id.toString(),
          propertyId: o.property?.toString(),
          number: o.number,
          businessCenterName: propertyMap.get(o.property?.toString() || '') || '',
          company: o.company,
        })),
        tenants: [] as Array<{ id: string; company: string; email?: string }>,
      };
    }

    const [properties, offices, tenants] = await Promise.all([
      this.propertyModel.find({ type: PropertyType.BUSINESS_CENTER, isActive: true }).sort({ name: 1 }).lean(),
      this.officeModel.find({ isActive: true }).sort({ number: 1 }).lean(),
      canFilterTenants
        ? this.userModel
            .find({ role: 'tenant', parentTenantId: null, isActive: { $ne: false } })
            .select('fullName company email')
            .sort({ company: 1, fullName: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p.name]));

    return {
      scope: 'all' as const,
      businessCenters: properties.map((p) => ({ id: p._id.toString(), name: p.name })),
      offices: offices.map((o) => ({
        id: o._id.toString(),
        propertyId: o.property?.toString(),
        number: o.number,
        businessCenterName: propertyMap.get(o.property?.toString() || '') || '',
        company: o.company,
      })),
      tenants: tenants.map((t) => ({
        id: t._id.toString(),
        company: t.company || t.fullName,
        email: t.email,
      })),
    };
  }

  async findReport(query: PassExportQueryDto, user?: any) {
    await this.expirePastPasses();

    const reportQuery = { ...query };
    if (!reportQuery.dateFrom && !reportQuery.dateTo && !reportQuery.date) {
      const today = this.getLocalDateString();
      reportQuery.dateTo = today;
      const monthStart = `${today.slice(0, 8)}01`;
      reportQuery.dateFrom = monthStart;
    }

    const filter = await this.buildListFilter(reportQuery, user);
    const limit = Math.min(reportQuery.limit || PASS_REPORT_PAGE_SIZE, PASS_REPORT_PAGE_SIZE);
    const offset = Math.max(reportQuery.offset || 0, 0);

    const [passes, total] = await Promise.all([
      this.passModel
        .find(filter)
        .sort({ visitDate: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      this.passModel.countDocuments(filter),
    ]);

    const withCheckout = await this.enrichPassCheckoutSettings(passes);
    const enriched = await this.enrichCreatorFields(withCheckout, user);

    return {
      passes: enriched.map((p) => this.mapToFrontend(p, user)),
      total,
      offset,
      limit,
      dateFrom: reportQuery.dateFrom,
      dateTo: reportQuery.dateTo,
    };
  }

  async exportCsv(query: PassExportQueryDto, user?: any) {
    await this.expirePastPasses();
    const filter = await this.buildListFilter(query, user);
    const limit = Math.min(query.limit || PASS_EXPORT_LIMIT, PASS_EXPORT_LIMIT);

    const passes = await this.passModel
      .find(filter)
      .sort({ visitDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const withCheckout = await this.enrichPassCheckoutSettings(passes);
    const enriched = await this.enrichCreatorFields(withCheckout, user);
    const includeCreator = !isTenantCompanyUser(user);

    return buildPassCsv(
      enriched.map((doc) => ({
        passNumber: doc.passNumber,
        status: doc.status,
        passType: doc.passType,
        visitDate: doc.visitDate,
        visitTimeFrom: doc.visitTimeFrom,
        visitTimeTo: doc.visitTimeTo,
        visitorName: doc.visitorName,
        visitorPhone: doc.visitorPhone,
        companyName: doc.companyName,
        visitPurpose: doc.visitPurpose,
        businessCenterName: doc.businessCenterName,
        office: doc.office,
        floor: doc.floor,
        vehiclePlate: doc.vehiclePlate,
        vehicleModel: doc.vehicleModel,
        creatorName: doc.creatorName,
        creatorCompany: doc.creatorCompany,
        creatorPhone: doc.creatorPhone,
        approverName: doc.approverName,
        checkedInAt: doc.checkedInAt,
        checkedOutAt: doc.checkedOutAt,
        comment: doc.comment,
        createdAt: doc.createdAt,
      })),
      { includeCreator },
    );
  }

  async findOne(id: string, user?: any) {
    await this.expirePastPasses();
    const pass = await this.passModel.findById(id).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    await this.ensurePassAccess(pass, user);
    const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
    const [enriched] = await this.enrichCreatorFields([withCheckout], user);
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
    const resolved = await this.resolveOfficeFields(passDto, user);
    const closedWeekdays = await this.getClosedWeekdaysForProperty(resolved.property);
    try {
      assertVisitDateBookable(passDto.visitDate, this.getTodayDate(), closedWeekdays);
    } catch (e) {
      if (e instanceof Error && e.message === 'PAST_DATE') {
        throw new BadRequestException('Нельзя заказать пропуск на прошедшую дату');
      }
      if (e instanceof Error && e.message === 'NOT_BOOKABLE') {
        throw new BadRequestException('Выберите одну из доступных дат визита');
      }
      throw new BadRequestException('Некорректная дата визита');
    }
    const workingHours = await this.resolveWorkingHours(resolved.property, passDto);
    passDto.visitTimeFrom = workingHours.from;
    passDto.visitTimeTo = workingHours.to;
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

    if (isTenantCompanyUser(user)) {
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

    const requireCheckout = await this.getRequireCheckoutForPass(pass);
    const now = new Date().toISOString();
    pass.checkedInAt = now;
    if (requireCheckout) {
      pass.status = 'active';
    } else {
      pass.status = 'completed';
      pass.checkedOutAt = now;
    }
    await pass.save();

    await this.auditService.log({
      action: 'pass.check_in',
      entityType: 'pass',
      entityId: pass._id,
      actor,
      details: { passNumber: pass.passNumber, visitorName: pass.visitorName },
    });

    const [withCheckout] = await this.enrichPassCheckoutSettings([pass.toObject()]);
    return { pass: this.mapToFrontend(withCheckout) };
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

    const [withCheckout] = await this.enrichPassCheckoutSettings([pass.toObject()]);
    return { pass: this.mapToFrontend(withCheckout) };
  }

  async getJournal(date?: string, user?: any) {
    await this.expirePastPasses();
    const targetDate = date || this.getTodayDate();
    const accessFilter = await this.buildAccessFilter(user);

    const passes = await this.passModel
      .find({ visitDate: targetDate, ...accessFilter })
      .sort({ createdAt: -1 })
      .lean();

    const withCheckout = await this.enrichPassCheckoutSettings(passes);
    const enriched = await this.enrichCreatorFields(withCheckout, user);
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

    const withCheckout = await this.enrichPassCheckoutSettings(passes);
    const enriched = await this.enrichCreatorFields(withCheckout, user);
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
    const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
    const [enriched] = await this.enrichCreatorFields([withCheckout], user || { role: 'security' });
    return { pass: this.mapToFrontend(enriched, user) };
  }

  async getPublicTicket(passNumber: string) {
    await this.expirePastPasses();
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
    const businessCenterName = await this.resolveBusinessCenterName(pass);
    return { ticket: { ...this.mapToPublicTicket(withCheckout), businessCenterName } };
  }

  async getOverdueActive(user?: any) {
    await this.expirePastPasses();
    const accessFilter = await this.buildAccessFilter(user);
    const passes = await this.passModel
      .find({ status: 'active', ...accessFilter })
      .sort({ visitDate: 1, visitTimeTo: 1 })
      .lean();

    const overdue = passes.filter((p) => this.isPassOverdueInBuilding(p));
    const withCheckout = await this.enrichPassCheckoutSettings(overdue);
    const enriched = await this.enrichCreatorFields(withCheckout, user);
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

  private async getClosedWeekdaysForProperty(propertyId?: Types.ObjectId) {
    if (!propertyId) return [];
    const property = await this.propertyModel.findById(propertyId).select('settings').lean();
    return parseClosedWeekdays(property?.settings?.closed_weekdays);
  }

  private async resolveWorkingHours(propertyId: Types.ObjectId | undefined, dto: CreatePassDto) {
    if (dto.visitTimeFrom && dto.visitTimeTo) {
      return { from: dto.visitTimeFrom, to: dto.visitTimeTo };
    }

    if (propertyId) {
      const property = await this.propertyModel.findById(propertyId).lean();
      const ps = property?.settings || {};
      return {
        from: dto.visitTimeFrom || ps.working_hours_from || '08:00',
        to: dto.visitTimeTo || ps.working_hours_to || '20:00',
      };
    }

    return {
      from: dto.visitTimeFrom || '08:00',
      to: dto.visitTimeTo || '20:00',
    };
  }

  private async getRequireCheckoutForPass(pass: { property?: Types.ObjectId }) {
    if (!pass.property) return true;
    const property = await this.propertyModel.findById(pass.property).select('settings').lean();
    return property?.settings?.require_checkout !== 'false';
  }

  private async enrichPassCheckoutSettings(docs: any[]) {
    const propertyIds = [
      ...new Set(docs.map((doc) => doc.property?.toString()).filter((id): id is string => !!id)),
    ];
    if (!propertyIds.length) return docs;

    const properties = await this.propertyModel
      .find({ _id: { $in: propertyIds.map((id) => new Types.ObjectId(id)) } })
      .select('settings')
      .lean();
    const checkoutMap = new Map(
      properties.map((p) => [p._id.toString(), p.settings?.require_checkout !== 'false']),
    );

    return docs.map((doc) => ({
      ...doc,
      requireCheckout: doc.property
        ? checkoutMap.get(doc.property.toString()) ?? true
        : true,
    }));
  }

  private async resolveOfficeFields(dto: CreatePassDto, user: any) {
    const tenantOwnerId = tenantOwnerObjectId(user);

    if (isTenantCompanyUser(user)) {
      if (!tenantOwnerId) {
        throw new ForbiddenException('Заказ пропусков недоступен');
      }
      const assignedOffices = await this.officeModel.countDocuments({
        tenantId: tenantOwnerId,
        isActive: true,
      });
      if (!assignedOffices) {
        throw new ForbiddenException(
          'Заказ пропусков недоступен: офис не назначен. Обратитесь к администратору.',
        );
      }
      if (!dto.officeId) {
        throw new BadRequestException('Выберите офис из списка');
      }
    }

    if (dto.officeId) {
      const office = await this.officeModel.findById(dto.officeId).lean();
      if (!office || !office.isActive) {
        throw new NotFoundException('Офис не найден');
      }

      if (isTenantCompanyUser(user)) {
        const ownsOffice = office.tenantId?.toString() === tenantOwnerId?.toString();
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

    if (isTenantCompanyUser(user)) {
      throw new BadRequestException('Выберите офис из списка');
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

    if (isTenantCompanyUser(user)) {
      const teamIds = await this.getTenantTeamIds(user);
      const createdBy = pass.createdBy?.toString();
      const hasAccess = teamIds.some((id) => id.toString() === createdBy);
      if (!hasAccess) throw new ForbiddenException('Нет доступа к этому пропуску');

      if (user.parentTenantId && createdBy !== user.userId) {
        throw new ForbiddenException('Нет доступа к этому пропуску');
      }
      return;
    }

    if (await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId)) return;

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
      requireCheckout: doc.requireCheckout !== false,
    };
  }

  private async enrichCreatorFields(docs: any[], viewer?: any) {
    if (!docs.length || isTenantCompanyUser(viewer)) return docs;

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
    const isTenant = isTenantCompanyUser(user);
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
      requireCheckout: doc.requireCheckout !== false,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}