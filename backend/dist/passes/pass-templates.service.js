"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const schemas_1 = require("../schemas");
const tenant_owner_1 = require("../common/tenant-owner");
let PassTemplatesService = class PassTemplatesService {
    templateModel;
    passModel;
    officeModel;
    propertyModel;
    constructor(templateModel, passModel, officeModel, propertyModel) {
        this.templateModel = templateModel;
        this.passModel = passModel;
        this.officeModel = officeModel;
        this.propertyModel = propertyModel;
    }
    async findAll(user) {
        const templates = await this.templateModel
            .find({ createdBy: new mongoose_2.Types.ObjectId(user.userId) })
            .sort({ updatedAt: -1 })
            .lean();
        return { templates: templates.map(this.mapToFrontend) };
    }
    async findOne(id, user) {
        const template = await this.templateModel.findById(id).lean();
        if (!template)
            throw new common_1.NotFoundException('Шаблон не найден');
        this.ensureOwner(template, user);
        return { template: this.mapToFrontend(template) };
    }
    async create(dto, user) {
        const resolved = await this.resolveOfficeFields(dto, user);
        const doc = await this.templateModel.create({
            ...dto,
            ...resolved,
            name: dto.name.trim(),
            visitorName: dto.visitorName.trim(),
            source: 'manual',
            createdBy: new mongoose_2.Types.ObjectId(user.userId),
        });
        return { template: this.mapToFrontend(doc) };
    }
    async createFromPass(passId, user, name) {
        const pass = await this.passModel.findById(passId).lean();
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        if (pass.createdBy?.toString() !== user.userId) {
            throw new common_1.ForbiddenException('Можно сохранять шаблон только из своих пропусков');
        }
        const template = await this.upsertFromPass(pass, user.userId, name);
        return { template: this.mapToFrontend(template) };
    }
    async syncFromPasses(user) {
        const passes = await this.passModel
            .find({ createdBy: new mongoose_2.Types.ObjectId(user.userId) })
            .sort({ createdAt: -1 })
            .lean();
        let created = 0;
        for (const pass of passes) {
            const before = await this.templateModel.countDocuments({
                createdBy: new mongoose_2.Types.ObjectId(user.userId),
                visitorName: pass.visitorName,
                passType: pass.passType,
                officeId: pass.officeId || undefined,
            });
            await this.upsertFromPass(pass, user.userId);
            const after = await this.templateModel.countDocuments({
                createdBy: new mongoose_2.Types.ObjectId(user.userId),
                visitorName: pass.visitorName,
                passType: pass.passType,
                officeId: pass.officeId || undefined,
            });
            if (after > before)
                created++;
        }
        return this.findAll(user).then((result) => ({
            ...result,
            imported: created,
        }));
    }
    async update(id, dto, user) {
        const template = await this.templateModel.findById(id);
        if (!template)
            throw new common_1.NotFoundException('Шаблон не найден');
        this.ensureOwner(template, user);
        if (dto.name !== undefined)
            template.name = dto.name.trim();
        if (dto.visitorName !== undefined)
            template.visitorName = dto.visitorName.trim();
        if (dto.visitorPhone !== undefined)
            template.visitorPhone = dto.visitorPhone?.trim();
        if (dto.companyName !== undefined)
            template.companyName = dto.companyName?.trim();
        if (dto.visitPurpose !== undefined)
            template.visitPurpose = dto.visitPurpose?.trim();
        if (dto.passType !== undefined)
            template.passType = dto.passType;
        if (dto.vehiclePlate !== undefined)
            template.vehiclePlate = dto.vehiclePlate?.trim();
        if (dto.vehicleModel !== undefined)
            template.vehicleModel = dto.vehicleModel?.trim();
        if (dto.visitTimeFrom !== undefined)
            template.visitTimeFrom = dto.visitTimeFrom;
        if (dto.visitTimeTo !== undefined)
            template.visitTimeTo = dto.visitTimeTo;
        if (dto.officeId !== undefined) {
            const resolved = await this.resolveOfficeFields({ ...dto, visitorName: template.visitorName, passType: template.passType, name: template.name }, user);
            Object.assign(template, resolved);
        }
        else {
            if (dto.office !== undefined)
                template.office = dto.office?.trim();
            if (dto.floor !== undefined)
                template.floor = dto.floor?.trim();
        }
        if (dto.comment !== undefined)
            template.comment = dto.comment?.trim();
        await template.save();
        return { template: this.mapToFrontend(template) };
    }
    async remove(id, user) {
        const template = await this.templateModel.findById(id);
        if (!template)
            throw new common_1.NotFoundException('Шаблон не найден');
        this.ensureOwner(template, user);
        await template.deleteOne();
        return { ok: true };
    }
    async upsertFromPass(pass, userId, name) {
        const filter = {
            createdBy: new mongoose_2.Types.ObjectId(userId),
            visitorName: pass.visitorName,
            passType: pass.passType,
        };
        if (pass.officeId)
            filter.officeId = pass.officeId;
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
        return this.templateModel.findOneAndUpdate(filter, { $set: update, $setOnInsert: { createdBy: new mongoose_2.Types.ObjectId(userId) } }, { upsert: true, new: true });
    }
    async resolveOfficeFields(dto, user) {
        const tenantOwnerId = (0, tenant_owner_1.tenantOwnerObjectId)(user);
        if (user?.role === 'tenant') {
            if (!tenantOwnerId) {
                throw new common_1.ForbiddenException('Создание шаблонов недоступно');
            }
            const assignedOffices = await this.officeModel.countDocuments({
                tenantId: tenantOwnerId,
                isActive: true,
            });
            if (!assignedOffices) {
                throw new common_1.ForbiddenException('Создание шаблонов недоступно: офис не назначен. Обратитесь к администратору.');
            }
            if (!dto.officeId) {
                throw new common_1.BadRequestException('Выберите офис из списка');
            }
        }
        if (!dto.officeId) {
            return {
                office: dto.office?.trim(),
                floor: dto.floor?.trim(),
            };
        }
        const office = await this.officeModel.findById(dto.officeId).lean();
        if (!office || !office.isActive)
            throw new common_1.NotFoundException('Офис не найден');
        if (user.role === 'tenant' && office.tenantId?.toString() !== tenantOwnerId?.toString()) {
            throw new common_1.ForbiddenException('Вы можете использовать только свои офисы');
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
    ensureOwner(template, user) {
        if (template.createdBy?.toString() !== user.userId) {
            throw new common_1.ForbiddenException('Нет доступа к этому шаблону');
        }
    }
    mapToFrontend(doc) {
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
};
exports.PassTemplatesService = PassTemplatesService;
exports.PassTemplatesService = PassTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.PassTemplate.name)),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.Pass.name)),
    __param(2, (0, mongoose_1.InjectModel)(schemas_1.Office.name)),
    __param(3, (0, mongoose_1.InjectModel)(schemas_1.Property.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], PassTemplatesService);
//# sourceMappingURL=pass-templates.service.js.map