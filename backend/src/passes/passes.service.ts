import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessConfigService } from '../access/access-config.service';
import { AuditActor, AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Office, OfficeDocument, Pass, PassDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { PropertyType } from '../schemas/enums';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PassTemplatesService } from './pass-templates.service';

@Injectable()
export class PassesService {
  constructor(
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
    return `PS-${year}-${random}`;
  }

  private async buildAccessFilter(user?: any) {
    if (!user?.role) return { _id: null };

    if (await this.accessConfigService.canViewAllPasses(user.role)) {
      return {};
    }

    if (await this.accessConfigService.hasPermission(user.role, 'passes.view_own')) {
      return { createdBy: new Types.ObjectId(user.userId) };
    }

    return { _id: null };
  }

  async findAll(params: { status?: string; date?: string; search?: string }, user?: any) {
    const filter: any = { ...(await this.buildAccessFilter(user)) };

    if (params.status) filter.status = params.status;
    if (params.date) filter.visitDate = params.date;

    if (params.search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { visitorName: new RegExp(params.search, 'i') },
          { vehiclePlate: new RegExp(params.search, 'i') },
          { companyName: new RegExp(params.search, 'i') },
          { businessCenterName: new RegExp(params.search, 'i') },
        ],
      });
    }

    const passes = await this.passModel.find(filter).sort({ createdAt: -1 }).lean();
    return { passes: passes.map((p) => this.mapToFrontend(p, user)) };
  }

  async findOne(id: string, user?: any) {
    const pass = await this.passModel.findById(id).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    await this.ensurePassAccess(pass, user);
    return { pass: this.mapToFrontend(pass, user) };
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

    const resolved = await this.resolveOfficeFields(passDto, user);

    const passNumber = this.generatePassNumber();
    const doc = await this.passModel.create({
      ...passDto,
      ...resolved,
      passNumber,
      status: 'pending',
      createdBy: user?.userId,
      creatorName: user?.fullName || user?.email,
      creatorCompany: resolved.companyName || passDto.companyName,
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
    const isCreator = actor?.userId && pass.createdBy?.toString() === actor.userId;

    if (dto.status === 'cancelled') {
      if (!canApprove && !isCreator) {
        throw new ForbiddenException('Нельзя отменить этот пропуск');
      }
      if (!canApprove && pass.status !== 'pending') {
        throw new BadRequestException('Можно отменить только заявку на рассмотрении');
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
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const accessFilter = await this.buildAccessFilter(user);

    const passes = await this.passModel
      .find({ visitDate: targetDate, ...accessFilter })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = passes.map((p) => this.mapToFrontend(p, user));
    const stats = {
      total: mapped.length,
      pending: mapped.filter((p) => p.status === 'pending').length,
      active: mapped.filter((p) => p.status === 'active').length,
      completed: mapped.filter((p) => p.status === 'completed').length,
      approved: mapped.filter((p) => p.status === 'approved').length,
    };

    return { date: targetDate, stats, passes: mapped };
  }

  async lookup(passNumber: string) {
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    return { pass: this.mapToFrontend(pass) };
  }

  async getPublicTicket(passNumber: string) {
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    const businessCenterName = await this.resolveBusinessCenterName(pass);
    return { ticket: { ...this.mapToPublicTicket(pass), businessCenterName } };
  }

  async getStats(user?: any) {
    const today = new Date().toISOString().slice(0, 10);
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
      visitorName: doc.visitorName,
      visitorPhone: doc.visitorPhone,
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