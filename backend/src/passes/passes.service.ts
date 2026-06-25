import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessConfigService } from '../access/access-config.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Office, OfficeDocument, Pass, PassDocument, Property, PropertyDocument } from '../schemas';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PassTemplatesService } from './pass-templates.service';

@Injectable()
export class PassesService {
  constructor(
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    private accessConfigService: AccessConfigService,
    private passTemplatesService: PassTemplatesService,
  ) {}

  private generatePassNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `PS-${year}-${random}`;
  }

  private async buildAccessFilter(user?: any) {
    if (!user || user.role === 'admin' || user.role === 'security') {
      return {};
    }

    return { createdBy: new Types.ObjectId(user.userId) };
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

    const resolved = await this.resolveOfficeFields(dto, user);

    const passNumber = this.generatePassNumber();
    const doc = await this.passModel.create({
      ...dto,
      ...resolved,
      passNumber,
      status: 'pending',
      createdBy: user?.userId,
      creatorName: user?.email,
      creatorCompany: resolved.companyName || dto.companyName,
    });

    if (user?.role === 'tenant') {
      await this.passTemplatesService.upsertFromPass(doc.toObject(), user.userId);
    }

    return { pass: this.mapToFrontend(doc, user) };
  }

  async updateStatus(id: string, dto: UpdateStatusDto, actor?: any) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = dto.status;
    if (dto.rejectionReason) pass.rejectionReason = dto.rejectionReason;

    if (dto.status === 'approved') {
      pass.approvedAt = new Date().toISOString();
      pass.approverName = actor?.email || 'admin';
    }

    await pass.save();
    return { pass: this.mapToFrontend(pass) };
  }

  async checkIn(id: string) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = 'active';
    pass.checkedInAt = new Date().toISOString();
    await pass.save();
    return { pass: this.mapToFrontend(pass) };
  }

  async checkOut(id: string) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = 'completed';
    pass.checkedOutAt = new Date().toISOString();
    await pass.save();
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

    return {
      office: dto.office.trim(),
      floor: dto.floor,
    };
  }

  private async ensurePassAccess(pass: any, user?: any) {
    if (!user || user.role === 'admin' || user.role === 'security') return;

    if (pass.createdBy?.toString() === user.userId) return;

    throw new ForbiddenException('Нет доступа к этому пропуску');
  }

  private countBy(arr: any[], key: string) {
    return arr.reduce((acc, item) => {
      const val = item[key] || 'unknown';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private mapToFrontend(doc: any, user?: any) {
    const isTenant = user?.role === 'tenant';
    return {
      id: doc._id.toString(),
      passNumber: doc.passNumber,
      createdBy: isTenant ? undefined : doc.createdBy?.toString() || '',
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