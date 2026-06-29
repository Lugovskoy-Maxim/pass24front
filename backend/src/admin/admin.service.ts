import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { resolvePersonName, splitFullName } from '../common/person-name';
import { mapProfileChangeRequest } from '../common/profile-change';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AuditActor, AuditQuery, AuditService } from '../audit/audit.service';
import { PassesService } from '../passes/passes.service';
import { Office, OfficeDocument, Pass, PassDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { PropertyType } from '../schemas/enums';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';
import { BusinessCenterPassSettingsDto } from './dto/business-center-pass-settings.dto';

const STAFF_ROLES = ['security', 'bc_admin', 'admin'] as const;

export interface UserQuery {
  category?: 'tenants' | 'staff';
  role?: string;
  search?: string;
  isActive?: string;
  propertyId?: string;
  officeId?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    private auditService: AuditService,
    private passesService: PassesService,
  ) {}

  async dashboard() {
    await this.passesService.expirePastPasses();
    const [users, passes, properties, offices] = await Promise.all([
      this.userModel.find().lean(),
      this.passModel.find().lean(),
      this.propertyModel.find({ type: PropertyType.BUSINESS_CENTER, isActive: true }).lean(),
      this.officeModel.find({ isActive: true }).lean(),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const todayPasses = passes.filter((p) => p.visitDate === today);
    const weekPasses = passes.filter((p) => p.visitDate >= weekAgo);

    const recentActivity = await this.auditService.getRecent(10);

    return {
      stats: {
        users: {
          total: users.length,
          byRole: this.countBy(users, 'role'),
        },
        passes: {
          total: passes.length,
          today: todayPasses.length,
          week: weekPasses.length,
          byStatus: this.countBy(passes, 'status'),
        },
        businessCenters: properties.length,
      },
      recentActivity,
      businessCenterNames: properties.map((p) => p.name),
      officesCount: offices.length,
    };
  }

  getAudit(query: AuditQuery = {}) {
    return this.auditService.getAudit(query);
  }

  exportAuditCsv(query: AuditQuery = {}) {
    return this.auditService.exportCsv(query);
  }

  async getUsers(params: UserQuery = {}) {
    const filter = await this.buildUserFilter(params);
    const tenantCountFilter = await this.buildUserFilter({ ...params, category: 'tenants', role: undefined });
    const staffCountFilter = await this.buildUserFilter({ ...params, category: 'staff', role: undefined });

    const [users, total, counts] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).lean(),
      this.userModel.countDocuments(filter),
      Promise.all([
        this.userModel.countDocuments(tenantCountFilter),
        this.userModel.countDocuments(staffCountFilter),
      ]).then(([tenants, staff]) => ({ tenants, staff })),
    ]);
    const passCounts = await this.passModel.aggregate([
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(passCounts.map((p) => [p._id?.toString(), p.count]));

    const officeLinks = await this.officeModel.find({ tenantId: { $in: users.map((u) => u._id) } }).lean();
    const officesByTenant = officeLinks.reduce((acc, office) => {
      const key = office.tenantId?.toString();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(office);
      return acc;
    }, {} as Record<string, typeof officeLinks>);

    const propertyIds = [
      ...new Set(users.flatMap((u) => (u.properties || []).map((p) => p.toString()))),
    ];
    const properties = propertyIds.length
      ? await this.propertyModel.find({ _id: { $in: propertyIds } }).lean()
      : [];
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    const propertyMapByOffice = new Map<string, any>();
    const officePropertyIds = [...new Set(officeLinks.map((o) => o.property.toString()))];
    const officeProperties = officePropertyIds.length
      ? await this.propertyModel.find({ _id: { $in: officePropertyIds } }).lean()
      : [];
    officeProperties.forEach((p) => propertyMapByOffice.set(p._id.toString(), p));

    return {
      users: users.map((u) => {
        const tenantOffices = (officesByTenant[u._id.toString()] || []).map((o) =>
          this.mapOffice(o, propertyMapByOffice, new Map()),
        );
        const businessCenters = (u.properties || []).map((pid) => ({
          id: pid.toString(),
          name: propertyMap.get(pid.toString())?.name || 'БЦ',
        }));
        return this.mapUser(u, countMap.get(u._id.toString()) || 0, tenantOffices, businessCenters);
      }),
      total,
      counts,
    };
  }

  private async buildUserFilter(params: UserQuery) {
    const filter: Record<string, unknown> = {};

    if (params.category === 'tenants') {
      filter.role = 'tenant';
    } else if (params.category === 'staff') {
      if (params.role && STAFF_ROLES.includes(params.role as (typeof STAFF_ROLES)[number])) {
        filter.role = params.role;
      } else {
        filter.role = { $in: [...STAFF_ROLES] };
      }
    } else if (params.role) {
      filter.role = params.role;
    }

    if (params.isActive === 'true') filter.isActive = true;
    if (params.isActive === 'false') filter.isActive = false;

    if (params.search?.trim()) {
      const rx = new RegExp(params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ fullName: rx }, { email: rx }, { company: rx }, { office: rx }];
    }

    const isStaffCategory = params.category === 'staff' || (params.role && params.role !== 'tenant' && !params.category);

    if (params.officeId?.trim()) {
      const office = await this.officeModel.findById(params.officeId.trim()).lean();
      if (office?.tenantId) {
        filter._id = office.tenantId;
        filter.role = 'tenant';
      } else {
        filter._id = { $in: [] };
      }
    } else if (params.propertyId?.trim()) {
      const propertyObjectId = new Types.ObjectId(params.propertyId.trim());
      if (isStaffCategory) {
        filter.properties = propertyObjectId;
      } else {
        const tenantIds = await this.officeModel.distinct('tenantId', {
          property: propertyObjectId,
          tenantId: { $exists: true, $ne: null },
        });
        filter._id = { $in: tenantIds };
        filter.role = 'tenant';
      }
    }

    return filter;
  }

  async createUser(dto: CreateUserDto, actor?: AuditActor) {
    const email = dto.email.toLowerCase();
    const existing = await this.userModel.findOne({ email });
    if (existing) throw new ConflictException('Пользователь с таким email уже существует');

    const hashed = await bcrypt.hash(dto.password, 10);
    let personName;
    try {
      personName = resolvePersonName(dto);
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }
    const user = await this.userModel.create({
      email,
      fullName: personName.fullName,
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      phone: dto.phone,
      company: dto.company,
      role: dto.role,
      office: dto.office,
      floor: dto.floor,
      password: hashed,
      isActive: true,
    } as any);

    if (dto.role === 'tenant' && dto.officeIds !== undefined) {
      await this.assignOfficesToTenant(user._id.toString(), dto.officeIds);
    }
    if ((dto.role === 'security' || dto.role === 'bc_admin') && dto.propertyIds !== undefined) {
      user.properties = dto.propertyIds.map((pid) => new Types.ObjectId(pid));
      await user.save();
    }

    const offices = await this.getTenantOffices(user._id.toString());
    const businessCenters = await this.getUserBusinessCenters(user);

    await this.auditService.log({
      action: 'user.create',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { email: user.email, role: user.role, fullName: user.fullName },
    });

    return { user: this.mapUser(user.toObject(), 0, offices, businessCenters) };
  }

  async getProfileChangeRequests() {
    const users = await this.userModel
      .find({ role: 'tenant', 'profileChangeRequest.requestedAt': { $exists: true, $ne: null } })
      .sort({ 'profileChangeRequest.requestedAt': -1 })
      .lean();

    const items = await Promise.all(users.map(async (user) => {
      const offices = await this.getTenantOffices(user._id.toString());
      return {
        user: this.mapUser(user, 0, offices, []),
        request: mapProfileChangeRequest(user.profileChangeRequest),
      };
    }));

    return { requests: items.filter((item) => item.request) };
  }

  async approveProfileChange(id: string, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!user.profileChangeRequest?.requestedAt) {
      throw new BadRequestException('Нет заявки на изменение профиля');
    }

    const req = user.profileChangeRequest;
    user.lastName = req.lastName;
    user.firstName = req.firstName;
    user.middleName = req.middleName;
    user.fullName = req.fullName;
    if (req.phone !== undefined) user.phone = req.phone;
    if (req.company !== undefined) user.company = req.company;
    user.profileChangeRequest = null;
    user.markModified('profileChangeRequest');
    await user.save();

    await this.auditService.log({
      action: 'profile.change_approved',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { fullName: user.fullName, email: user.email },
    });

    const offices = await this.getTenantOffices(id);
    return { user: this.mapUser(user.toObject(), 0, offices, []) };
  }

  async rejectProfileChange(id: string, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!user.profileChangeRequest?.requestedAt) {
      throw new BadRequestException('Нет заявки на изменение профиля');
    }

    const requestedName = user.profileChangeRequest.fullName;
    user.profileChangeRequest = null;
    user.markModified('profileChangeRequest');
    await user.save();

    await this.auditService.log({
      action: 'profile.change_rejected',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { fullName: requestedName, email: user.email },
    });

    const offices = await this.getTenantOffices(id);
    return { user: this.mapUser(user.toObject(), 0, offices, []) };
  }

  async updateUser(id: string, dto: Partial<CreateUserDto & { isActive: boolean }>, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');

    const prevRole = user.role;

    if (dto.fullName !== undefined || dto.lastName !== undefined || dto.firstName !== undefined || dto.middleName !== undefined) {
      try {
        const personName = resolvePersonName({
          fullName: dto.fullName ?? user.fullName,
          lastName: dto.lastName ?? user.lastName,
          firstName: dto.firstName ?? user.firstName,
          middleName: dto.middleName ?? user.middleName,
        });
        user.fullName = personName.fullName;
        user.lastName = personName.lastName;
        user.firstName = personName.firstName;
        user.middleName = personName.middleName;
      } catch {
        throw new BadRequestException('Укажите фамилию и имя');
      }
    }
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.company !== undefined) user.company = dto.company;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.office !== undefined) user.office = dto.office;
    if (dto.floor !== undefined) user.floor = dto.floor;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.password = await bcrypt.hash(dto.password, 10);

    if (dto.role && dto.role !== 'tenant' && prevRole === 'tenant') {
      await this.assignOfficesToTenant(id, []);
    }
    if (dto.role && !['security', 'bc_admin'].includes(dto.role) && ['security', 'bc_admin'].includes(prevRole)) {
      user.properties = [];
    }
    if (dto.role === 'tenant' && prevRole !== 'tenant') {
      user.properties = [];
    }
    if (dto.propertyIds !== undefined && ['security', 'bc_admin'].includes(user.role)) {
      user.properties = dto.propertyIds.map((pid) => new Types.ObjectId(pid));
    }

    await user.save();

    if (dto.officeIds !== undefined && user.role === 'tenant') {
      await this.assignOfficesToTenant(id, dto.officeIds);
    }

    const offices = await this.getTenantOffices(id);
    const passesCount = await this.passModel.countDocuments({ createdBy: user._id });
    const businessCenters = await this.getUserBusinessCenters(user);

    await this.auditService.log({
      action: 'user.update',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { email: user.email, role: user.role, isActive: user.isActive },
    });

    return { user: this.mapUser(user.toObject(), passesCount, offices, businessCenters) };
  }

  async updateBusinessCenter(id: string, dto: UpdateBusinessCenterDto, actor?: AuditActor) {
    const property = await this.propertyModel.findById(id);
    if (!property) throw new NotFoundException('Бизнес-центр не найден');
    await this.ensureBcAccess(property._id.toString(), actor);

    if (dto.name?.trim()) property.name = dto.name.trim();
    if (dto.address?.trim()) property.address = dto.address.trim();
    if (dto.passSettings) {
      property.settings = this.mergeBcPassSettings(property.settings, dto.passSettings);
      property.markModified('settings');
    }
    await property.save();

    const stats = await this.officeModel.aggregate([
      { $match: { property: property._id, isActive: true } },
      { $group: { _id: '$property', count: { $sum: 1 }, totalAreaSqm: { $sum: { $ifNull: ['$areaSqm', 0] } } } },
    ]);

    await this.auditService.log({
      action: 'bc.update',
      entityType: 'business_center',
      entityId: property._id,
      actor,
      details: { name: property.name, address: property.address },
    });

    return {
      businessCenter: {
        id: property._id.toString(),
        name: property.name,
        address: property.address,
        officesCount: stats[0]?.count || 0,
        totalAreaSqm: stats[0]?.totalAreaSqm || 0,
        isActive: property.isActive,
        createdAt: (property as any).createdAt,
        passSettings: this.mapBcPassSettings(property.toObject()),
      },
    };
  }

  async getBusinessCenters(actor?: any) {
    const filter: Record<string, unknown> = { type: PropertyType.BUSINESS_CENTER };
    const scope = await this.getActorPropertyIds(actor);
    if (scope?.length) filter._id = { $in: scope.map((id) => new Types.ObjectId(id)) };

    const properties = await this.propertyModel
      .find(filter)
      .sort({ name: 1 })
      .lean();

    const officeStats = await this.officeModel.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$property',
          count: { $sum: 1 },
          totalAreaSqm: { $sum: { $ifNull: ['$areaSqm', 0] } },
        },
      },
    ]);
    const statsMap = new Map(officeStats.map((s) => [s._id.toString(), s]));

    return {
      businessCenters: properties.map((p) => {
        const stats = statsMap.get(p._id.toString());
        return {
          id: p._id.toString(),
          name: p.name,
          address: p.address,
          officesCount: stats?.count || 0,
          totalAreaSqm: stats?.totalAreaSqm || 0,
          isActive: p.isActive,
          createdAt: (p as any).createdAt,
          passSettings: this.mapBcPassSettings(p),
        };
      }),
    };
  }

  async createBusinessCenter(dto: CreateBusinessCenterDto, actor?: AuditActor) {
    const property = await this.propertyModel.create({
      name: dto.name.trim(),
      address: dto.address.trim(),
      code: dto.code?.trim(),
      type: PropertyType.BUSINESS_CENTER,
      isActive: true,
      settings: {},
      gates: ['Главный вход'],
    });

    await this.auditService.log({
      action: 'bc.create',
      entityType: 'business_center',
      entityId: property._id,
      actor,
      details: { name: property.name, address: property.address },
    });

    return {
      businessCenter: {
        id: property._id.toString(),
        name: property.name,
        address: property.address,
        officesCount: 0,
        isActive: true,
        createdAt: (property as any).createdAt,
        passSettings: this.mapBcPassSettings(property.toObject()),
      },
    };
  }

  async getOffices() {
    const offices = await this.officeModel.find().sort({ createdAt: -1 }).lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const tenantIds = [...new Set(offices.filter((o) => o.tenantId).map((o) => o.tenantId!.toString()))];

    const [properties, tenants] = await Promise.all([
      this.propertyModel.find({ _id: { $in: propertyIds } }).lean(),
      this.userModel.find({ _id: { $in: tenantIds } }).lean(),
    ]);

    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));

    return {
      offices: offices.map((o) => this.mapOffice(o, propertyMap, tenantMap)),
    };
  }

  async createOffice(dto: CreateOfficeDto, actor?: AuditActor) {
    const property = await this.propertyModel.findById(dto.propertyId);
    if (!property) throw new NotFoundException('Бизнес-центр не найден');

    const existing = await this.officeModel.findOne({
      property: dto.propertyId,
      number: dto.number.trim(),
    });
    if (existing) throw new ConflictException('Офис с таким номером уже есть в этом БЦ');

    const office = await this.officeModel.create({
      property: new Types.ObjectId(dto.propertyId),
      number: dto.number.trim(),
      floor: dto.floor.trim(),
      areaSqm: dto.areaSqm,
      company: dto.company?.trim(),
      tenantId: dto.tenantId ? new Types.ObjectId(dto.tenantId) : undefined,
      isActive: true,
    });

    if (dto.tenantId) {
      await this.syncTenantProperties(dto.tenantId);
    }

    const propertyMap = new Map([[property._id.toString(), property]]);
    const tenant = dto.tenantId ? await this.userModel.findById(dto.tenantId).lean() : null;
    const tenantMap = tenant ? new Map([[tenant._id.toString(), tenant]]) : new Map();

    await this.auditService.log({
      action: 'office.create',
      entityType: 'office',
      entityId: office._id,
      actor,
      details: { number: office.number, floor: office.floor, propertyId: dto.propertyId },
    });

    return { office: this.mapOffice(office.toObject(), propertyMap, tenantMap) };
  }

  async updateOffice(id: string, dto: Partial<CreateOfficeDto & { isActive: boolean }>, actor?: AuditActor) {
    const office = await this.officeModel.findById(id);
    if (!office) throw new NotFoundException('Офис не найден');

    const prevTenantId = office.tenantId?.toString();

    if (dto.company !== undefined) office.company = dto.company?.trim();
    if (dto.areaSqm !== undefined) office.areaSqm = dto.areaSqm;
    if (dto.isActive !== undefined) office.isActive = dto.isActive;
    if (dto.tenantId !== undefined) {
      office.tenantId = dto.tenantId ? new Types.ObjectId(dto.tenantId) : undefined;
    }

    await office.save();

    if (prevTenantId) await this.syncTenantProperties(prevTenantId);
    if (office.tenantId) await this.syncTenantProperties(office.tenantId.toString());

    const property = await this.propertyModel.findById(office.property).lean();
    const tenant = office.tenantId ? await this.userModel.findById(office.tenantId).lean() : null;
    const propertyMap = property ? new Map([[property._id.toString(), property]]) : new Map();
    const tenantMap = tenant ? new Map([[tenant._id.toString(), tenant]]) : new Map();

    await this.auditService.log({
      action: 'office.update',
      entityType: 'office',
      entityId: office._id,
      actor,
      details: { number: office.number, isActive: office.isActive },
    });

    return { office: this.mapOffice(office.toObject(), propertyMap, tenantMap) };
  }

  async seedTestData() {
    const result = {
      businessCenters: 0,
      offices: 0,
      tenants: 0,
      skipped: true,
    };

    const bcData = [
      { name: 'БЦ Атриум', address: 'ул. Тверская, 12', code: 'atrium' },
      { name: 'БЦ Сити Плаза', address: 'Пресненская наб., 8', code: 'city-plaza' },
    ];

    const bcMap = new Map<string, PropertyDocument>();
    for (const bc of bcData) {
      let property = await this.propertyModel.findOne({ code: bc.code });
      if (!property) {
        property = await this.propertyModel.create({
          ...bc,
          type: PropertyType.BUSINESS_CENTER,
          isActive: true,
          settings: {},
          gates: ['Главный вход', 'Парковка P1'],
        });
        result.businessCenters++;
        result.skipped = false;
      }
      bcMap.set(bc.code, property);
    }

    const tenantSpecs = [
      {
        email: 'tenant@pass24.local',
        password: 'tenant123',
        fullName: 'Арендатор Тестовый',
        company: 'ООО «Ромашка»',
        offices: [
          { bc: 'atrium', number: '401', floor: '4', areaSqm: 85 },
          { bc: 'city-plaza', number: '1201', floor: '12', areaSqm: 120 },
        ],
      },
      {
        email: 'tenant2@pass24.local',
        password: 'tenant123',
        fullName: 'Петрова Анна',
        company: 'ООО «ТехноСофт»',
        offices: [{ bc: 'atrium', number: '402', floor: '4', areaSqm: 60 }],
      },
      {
        email: 'tenant3@pass24.local',
        password: 'tenant123',
        fullName: 'Сидоров Игорь',
        company: 'ИП Сидоров',
        offices: [{ bc: 'city-plaza', number: '1502', floor: '15', areaSqm: 45 }],
      },
    ];

    for (const spec of tenantSpecs) {
      let user = await this.userModel.findOne({ email: spec.email });
      if (!user) {
        user = await this.userModel.create({
          email: spec.email,
          fullName: spec.fullName,
          company: spec.company,
          role: 'tenant',
          password: await bcrypt.hash(spec.password, 10),
          isActive: true,
          office: spec.offices[0].number,
          floor: spec.offices[0].floor,
        } as any);
        result.tenants++;
        result.skipped = false;
      }

      for (const officeSpec of spec.offices) {
        const property = bcMap.get(officeSpec.bc)!;
        const exists = await this.officeModel.findOne({
          property: property._id,
          number: officeSpec.number,
        });
        if (!exists) {
          await this.officeModel.create({
            property: property._id,
            number: officeSpec.number,
            floor: officeSpec.floor,
            areaSqm: officeSpec.areaSqm,
            company: spec.company,
            tenantId: user!._id,
            isActive: true,
          });
          result.offices++;
          result.skipped = false;
        } else if (!exists.tenantId) {
          exists.tenantId = user!._id;
          exists.company = spec.company;
          await exists.save();
        }
      }

      await this.syncTenantProperties(user!._id.toString());
    }

    // Security user for reception
    if (!(await this.userModel.findOne({ email: 'security@pass24.local' }))) {
      await this.userModel.create({
        email: 'security@pass24.local',
        fullName: 'Сотрудник охраны',
        role: 'security',
        password: await bcrypt.hash('security123', 10),
        isActive: true,
        properties: [bcMap.get('atrium')!._id, bcMap.get('city-plaza')!._id],
      } as any);
      result.tenants++;
      result.skipped = false;
    }

    return {
      message: result.skipped
        ? 'Тестовые данные уже существуют'
        : 'Тестовые БЦ, офисы и арендаторы созданы',
      ...result,
    };
  }

  async getTenantOffices(tenantId: string) {
    const offices = await this.officeModel
      .find({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .sort({ number: 1 })
      .lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const properties = await this.propertyModel.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
    return offices.map((o) => this.mapOffice(o, propertyMap, new Map()));
  }

  private async assignOfficesToTenant(tenantId: string, officeIds: string[]) {
    await this.officeModel.updateMany(
      { tenantId: new Types.ObjectId(tenantId) },
      { $unset: { tenantId: 1 } },
    );
    if (officeIds.length) {
      await this.officeModel.updateMany(
        { _id: { $in: officeIds.map((id) => new Types.ObjectId(id)) } },
        { $set: { tenantId: new Types.ObjectId(tenantId) } },
      );
    }
    await this.syncTenantProperties(tenantId);
  }

  private async syncTenantProperties(tenantId: string) {
    const offices = await this.officeModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const primary = offices[0];

    await this.userModel.findByIdAndUpdate(tenantId, {
      properties: propertyIds.map((id) => new Types.ObjectId(id)),
      ...(primary
        ? { office: primary.number, floor: primary.floor, company: primary.company }
        : {}),
    });
  }

  private mapOffice(
    office: any,
    propertyMap: Map<string, any>,
    tenantMap: Map<string, any>,
  ) {
    const property = propertyMap.get(office.property?.toString());
    const tenant = office.tenantId ? tenantMap.get(office.tenantId.toString()) : null;
    return {
      id: office._id.toString(),
      propertyId: office.property?.toString(),
      businessCenterName: property?.name,
      number: office.number,
      floor: office.floor,
      areaSqm: office.areaSqm,
      company: office.company,
      tenantId: office.tenantId?.toString(),
      tenantName: tenant?.fullName,
      isActive: office.isActive,
      createdAt: office.createdAt,
    };
  }

  private async getUserBusinessCenters(user: any) {
    if (!user.properties?.length) return [];
    const properties = await this.propertyModel.find({ _id: { $in: user.properties } }).lean();
    return properties.map((p) => ({ id: p._id.toString(), name: p.name }));
  }

  private mapUser(user: any, passesCount: number, offices: any[] = [], businessCenters: { id: string; name: string }[] = []) {
    const nameParts = user.lastName || user.firstName
      ? { lastName: user.lastName || '', firstName: user.firstName || '', middleName: user.middleName || '' }
      : splitFullName(user.fullName);
    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      lastName: nameParts.lastName,
      firstName: nameParts.firstName,
      middleName: nameParts.middleName,
      phone: user.phone,
      company: user.company,
      role: user.role || 'tenant',
      office: user.office,
      floor: user.floor,
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
      passesCount,
      offices,
      businessCenters,
      propertyIds: businessCenters.map((bc) => bc.id),
      profileChangeRequest: mapProfileChangeRequest(user.profileChangeRequest),
    };
  }

  private async getActorPropertyIds(actor?: any): Promise<string[] | null> {
    if (!actor || actor.role === 'admin') return null;
    if (!['bc_admin', 'security'].includes(actor.role)) return null;
    const user = await this.userModel.findById(actor.userId).lean();
    return (user?.properties || []).map((p) => p.toString());
  }

  private async ensureBcAccess(propertyId: string, actor?: any) {
    if (!actor || actor.role === 'admin') return;
    if (actor.role !== 'bc_admin') return;
    const allowed = await this.getActorPropertyIds(actor);
    if (!allowed?.includes(propertyId)) {
      throw new NotFoundException('Бизнес-центр не найден');
    }
  }

  private mapBcPassSettings(property?: any) {
    const s = property?.settings || {};
    return {
      max_passes_per_day: s.max_passes_per_day || '200',
      auto_approve_delivery: s.auto_approve_delivery || 'false',
      working_hours_from: s.working_hours_from || '08:00',
      working_hours_to: s.working_hours_to || '20:00',
      contact_phone: s.contact_phone || '+7 (495) 000-00-00',
      contact_email: s.contact_email || 'reception@pass24.local',
      reception_floor: s.reception_floor || '1',
    };
  }

  private mergeBcPassSettings(
    current: Record<string, unknown> | undefined,
    dto: BusinessCenterPassSettingsDto,
  ) {
    const settings = { ...(current || {}) };
    if (dto.max_passes_per_day !== undefined) settings.max_passes_per_day = dto.max_passes_per_day;
    if (dto.auto_approve_delivery !== undefined) settings.auto_approve_delivery = dto.auto_approve_delivery;
    if (dto.working_hours_from !== undefined) settings.working_hours_from = dto.working_hours_from;
    if (dto.working_hours_to !== undefined) settings.working_hours_to = dto.working_hours_to;
    if (dto.contact_phone !== undefined) settings.contact_phone = dto.contact_phone;
    if (dto.contact_email !== undefined) settings.contact_email = dto.contact_email;
    if (dto.reception_floor !== undefined) settings.reception_floor = dto.reception_floor;
    return settings;
  }

  private countBy(arr: any[], key: string) {
    return arr.reduce((acc, item) => {
      const val = item[key] || 'unknown';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}