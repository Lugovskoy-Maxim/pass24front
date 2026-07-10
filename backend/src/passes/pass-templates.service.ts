import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Office, OfficeDocument, Pass, PassDocument, PassTemplate, PassTemplateDocument, Property, PropertyDocument,
} from '../schemas';
import { tenantOwnerObjectId } from '../common/tenant-owner';
import { CreatePassTemplateDto } from './dto/create-pass-template.dto';

@Injectable()
export class PassTemplatesService {
  constructor(
    @InjectModel(PassTemplate.name) private templateModel: Model<PassTemplateDocument>,
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
  ) {}

  async findAll(user: any) {
    const templates = await this.templateModel
      .find({ createdBy: new Types.ObjectId(user.userId) })
      .sort({ updatedAt: -1 })
      .lean();
    return { templates: templates.map(this.mapToFrontend) };
  }

  async findOne(id: string, user: any) {
    const template = await this.templateModel.findById(id).lean();
    if (!template) throw new NotFoundException('Шаблон не найден');
    this.ensureOwner(template, user);
    return { template: this.mapToFrontend(template) };
  }

  async create(dto: CreatePassTemplateDto, user: any) {
    const resolved = await this.resolveOfficeFields(dto, user);
    const doc = await this.templateModel.create({
      ...dto,
      ...resolved,
      name: dto.name.trim(),
      visitorName: dto.visitorName.trim(),
      source: 'manual',
      createdBy: new Types.ObjectId(user.userId),
    });
    return { template: this.mapToFrontend(doc) };
  }

  async createFromPass(passId: string, user: any, name?: string) {
    const pass = await this.passModel.findById(passId).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    if (pass.createdBy?.toString() !== user.userId) {
      throw new ForbiddenException('Можно сохранять шаблон только из своих пропусков');
    }

    const template = await this.upsertFromPass(pass, user.userId, name);
    return { template: this.mapToFrontend(template) };
  }

  async syncFromPasses(user: any) {
    const passes = await this.passModel
      .find({ createdBy: new Types.ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .lean();

    let created = 0;
    for (const pass of passes) {
      const before = await this.templateModel.countDocuments({
        createdBy: new Types.ObjectId(user.userId),
        visitorName: pass.visitorName,
        passType: pass.passType,
        officeId: pass.officeId || undefined,
      });
      await this.upsertFromPass(pass, user.userId);
      const after = await this.templateModel.countDocuments({
        createdBy: new Types.ObjectId(user.userId),
        visitorName: pass.visitorName,
        passType: pass.passType,
        officeId: pass.officeId || undefined,
      });
      if (after > before) created++;
    }

    return this.findAll(user).then((result) => ({
      ...result,
      imported: created,
    }));
  }

  async update(id: string, dto: Partial<CreatePassTemplateDto>, user: any) {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException('Шаблон не найден');
    this.ensureOwner(template, user);

    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.visitorName !== undefined) template.visitorName = dto.visitorName.trim();
    if (dto.visitorPhone !== undefined) template.visitorPhone = dto.visitorPhone?.trim();
    if (dto.companyName !== undefined) template.companyName = dto.companyName?.trim();
    if (dto.visitPurpose !== undefined) template.visitPurpose = dto.visitPurpose?.trim();
    if (dto.passType !== undefined) template.passType = dto.passType;
    if (dto.vehiclePlate !== undefined) template.vehiclePlate = dto.vehiclePlate?.trim();
    if (dto.vehicleModel !== undefined) template.vehicleModel = dto.vehicleModel?.trim();
    if (dto.visitTimeFrom !== undefined) template.visitTimeFrom = dto.visitTimeFrom;
    if (dto.visitTimeTo !== undefined) template.visitTimeTo = dto.visitTimeTo;
    if (dto.officeId !== undefined) {
      const resolved = await this.resolveOfficeFields({ ...dto, visitorName: template.visitorName, passType: template.passType, name: template.name }, user);
      Object.assign(template, resolved);
    } else {
      if (dto.office !== undefined) template.office = dto.office?.trim();
      if (dto.floor !== undefined) template.floor = dto.floor?.trim();
    }
    if (dto.comment !== undefined) template.comment = dto.comment?.trim();

    await template.save();
    return { template: this.mapToFrontend(template) };
  }

  async remove(id: string, user: any) {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException('Шаблон не найден');
    this.ensureOwner(template, user);
    await template.deleteOne();
    return { ok: true };
  }

  async upsertFromPass(pass: any, userId: string, name?: string) {
    const filter: Record<string, unknown> = {
      createdBy: new Types.ObjectId(userId),
      visitorName: pass.visitorName,
      passType: pass.passType,
    };
    if (pass.officeId) filter.officeId = pass.officeId;

    const update = {
      name: name?.trim() || pass.visitorName,
      source: 'from_pass',
      sourcePassId: pass._id,
      visitorName: pass.visitorName,
      visitorPhone: pass.visitorPhone,
      companyName: pass.companyName,
      visitPurpose: pass.visitPurpose,
      passType: pass.passType,
      vehiclePlate: pass.vehiclePlate,
      vehicleModel: pass.vehicleModel,
      visitTimeFrom: pass.visitTimeFrom,
      visitTimeTo: pass.visitTimeTo,
      officeId: pass.officeId,
      office: pass.office,
      floor: pass.floor,
      businessCenterName: pass.businessCenterName,
      comment: pass.comment,
    };

    return this.templateModel.findOneAndUpdate(
      filter,
      { $set: update, $setOnInsert: { createdBy: new Types.ObjectId(userId) } },
      { upsert: true, new: true },
    );
  }

  private async resolveOfficeFields(dto: CreatePassTemplateDto, user: any) {
    const tenantOwnerId = tenantOwnerObjectId(user);

    if (user?.role === 'tenant') {
      if (!tenantOwnerId) {
        throw new ForbiddenException('Создание шаблонов недоступно');
      }
      const assignedOffices = await this.officeModel.countDocuments({
        tenantId: tenantOwnerId,
        isActive: true,
      });
      if (!assignedOffices) {
        throw new ForbiddenException(
          'Создание шаблонов недоступно: офис не назначен. Обратитесь к администратору.',
        );
      }
      if (!dto.officeId) {
        throw new BadRequestException('Выберите офис из списка');
      }
    }

    if (!dto.officeId) {
      return {
        office: dto.office?.trim(),
        floor: dto.floor?.trim(),
      };
    }

    const office = await this.officeModel.findById(dto.officeId).lean();
    if (!office || !office.isActive) throw new NotFoundException('Офис не найден');

    if (user.role === 'tenant' && office.tenantId?.toString() !== tenantOwnerId?.toString()) {
      throw new ForbiddenException('Вы можете использовать только свои офисы');
    }

    const property = await this.propertyModel.findById(office.property).lean();

    return {
      officeId: office._id,
      office: office.number,
      floor: office.floor,
      businessCenterName: property?.name,
      companyName: dto.companyName || office.company,
    };
  }

  private ensureOwner(template: any, user: any) {
    if (template.createdBy?.toString() !== user.userId) {
      throw new ForbiddenException('Нет доступа к этому шаблону');
    }
  }

  private mapToFrontend(doc: any) {
    return {
      id: doc._id.toString(),
      name: doc.name,
      source: doc.source,
      sourcePassId: doc.sourcePassId?.toString(),
      visitorName: doc.visitorName,
      visitorPhone: doc.visitorPhone,
      companyName: doc.companyName,
      visitPurpose: doc.visitPurpose,
      passType: doc.passType,
      vehiclePlate: doc.vehiclePlate,
      vehicleModel: doc.vehicleModel,
      visitTimeFrom: doc.visitTimeFrom,
      visitTimeTo: doc.visitTimeTo,
      officeId: doc.officeId?.toString(),
      businessCenterName: doc.businessCenterName,
      office: doc.office,
      floor: doc.floor,
      comment: doc.comment,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}