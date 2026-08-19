import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolvePersonName, splitFullName } from '../common/person-name';
import { mapProfileChangeRequest } from '../common/profile-change';
import {
  applyUserIdentityDefaults,
  defaultProfileType,
  deriveIdentityStatus,
  identityView,
  normalizeLegalForm,
  shouldBumpAuthVersion,
} from '../common/pass-identity';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AuditActor, AuditQuery, AuditService } from '../audit/audit.service';
import { PassesService } from '../passes/passes.service';
import {
  Office,
  OfficeDocument,
  Pass,
  PassDocument,
  PassTemplate,
  PassTemplateDocument,
  Property,
  PropertyDocument,
  User,
  UserDocument,
} from '../schemas';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { PropertyType } from '../schemas/enums';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MstyleIdentityService } from '../integrations/mstyle-v2/mstyle-v2.identities';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';
import { BusinessCenterPassSettingsDto } from './dto/business-center-pass-settings.dto';
import { TestDataSeedService } from '../database/test-data-seed.service';
import {
  normalizeBusinessCenterName,
  SiteSourceService,
} from '../site-source/site-source.service';
import {
  BUILTIN_EMPLOYEE_ROLES,
  SYSTEM_ROLES,
} from '../access/access.constants';
import {
  collectOfficeTenantIds,
  officeAssignedToAnyQuery,
  officeAssignedToQuery,
  officeTenantWrite,
  normalizeOfficeTenantIds,
} from '../common/office-tenants';

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
    @InjectModel(User.name, AUTH_CONNECTION)
    private userModel: Model<UserDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    @InjectModel(PassTemplate.name)
    private passTemplateModel: Model<PassTemplateDocument>,
    private auditService: AuditService,
    private passesService: PassesService,
    private testDataSeedService: TestDataSeedService,
    private identities: MstyleIdentityService,
    private siteSource: SiteSourceService,
  ) {}

  private async syncResidentRecord(user: UserDocument) {
    if (user.role !== 'tenant' && !user.parentTenantId) return;
    try {
      await this.identities.ensureFromUser(user);
    } catch {
      /* User — источник; закрытый API подтянет при следующем входе */
    }
  }

  async assertRolesDeletable(roles: string[]) {
    for (const role of roles) {
      if ((SYSTEM_ROLES as readonly string[]).includes(role)) {
        throw new BadRequestException(`Нельзя удалить системную роль: ${role}`);
      }
      if ((BUILTIN_EMPLOYEE_ROLES as readonly string[]).includes(role)) {
        throw new BadRequestException(
          `Нельзя удалить встроенную роль сотрудника: ${role}`,
        );
      }
      const count = await this.userModel.countDocuments({
        role,
        isActive: { $ne: false },
      });
      if (count > 0) {
        throw new BadRequestException(
          `Нельзя удалить роль «${role}»: к ней привязаны пользователи`,
        );
      }
    }
  }

  async dashboard() {
    await this.passesService.expirePastPasses();
    const [users, passes, properties, offices] = await Promise.all([
      this.userModel.find().lean(),
      this.passModel.find().lean(),
      this.propertyModel
        .find({ type: PropertyType.BUSINESS_CENTER, isActive: true })
        .lean(),
      this.officeModel.find({ isActive: true }).lean(),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const todayPasses = passes.filter((p) => p.visitDate === today);
    const weekPasses = passes.filter((p) => p.visitDate >= weekAgo);

    const recentActivity = await this.auditService.getRecent(10);

    const registrationPending = users.filter(
      (u) =>
        u.role === 'tenant' &&
        u.isActive === false &&
        !u.parentTenantId &&
        !u.invitePending,
    ).length;

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
        registrationPending,
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
    const tenantCountFilter = await this.buildUserFilter({
      ...params,
      category: 'tenants',
      role: undefined,
    });
    const staffCountFilter = await this.buildUserFilter({
      ...params,
      category: 'staff',
      role: undefined,
    });

    const [initialUsers, initialTotal, counts] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).lean(),
      this.userModel.countDocuments(filter),
      Promise.all([
        this.userModel.countDocuments(tenantCountFilter),
        this.userModel.countDocuments(staffCountFilter),
      ]).then(([tenants, staff]) => ({ tenants, staff })),
    ]);
    let users = initialUsers;
    let total = initialTotal;

    // Поиск по сотрудникам компании: подтянуть владельцев, у которых сотрудник совпал
    if (params.category === 'tenants' && params.search?.trim()) {
      const rx = new RegExp(
        params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const matchingEmployees = await this.userModel
        .find({
          parentTenantId: { $exists: true, $ne: null },
          $or: [
            { fullName: rx },
            { displayName: rx },
            { username: rx },
            { email: rx },
            { company: rx },
            { phone: rx },
            { passSubject: rx },
          ],
        })
        .select('parentTenantId')
        .lean();
      const extraOwnerIds = [
        ...new Set(
          matchingEmployees
            .map((e) => e.parentTenantId?.toString())
            .filter(
              (id): id is string =>
                !!id && !users.some((u) => u._id.toString() === id),
            ),
        ),
      ];
      if (extraOwnerIds.length) {
        const extraOwners = await this.userModel
          .find({
            _id: { $in: extraOwnerIds.map((id) => new Types.ObjectId(id)) },
            role: 'tenant',
            $or: [
              { parentTenantId: null },
              { parentTenantId: { $exists: false } },
            ],
          })
          .lean();
        users = [...users, ...extraOwners];
        total = users.length;
      }
    }

    const passCounts = await this.passModel.aggregate([
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      passCounts.map((p) => [p._id?.toString(), p.count]),
    );

    const ownerIds = users.map((u) => u._id);
    const officeLinks = await this.officeModel
      .find(officeAssignedToAnyQuery(ownerIds))
      .lean();
    const ownerIdSet = new Set(ownerIds.map((id) => id.toString()));
    const officesByTenant = officeLinks.reduce(
      (acc, office) => {
        for (const key of collectOfficeTenantIds(office)) {
          if (!ownerIdSet.has(key)) continue;
          if (!acc[key]) acc[key] = [];
          acc[key].push(office);
        }
        return acc;
      },
      {} as Record<string, typeof officeLinks>,
    );

    // Сотрудники, привязанные к владельцам (для вкладки «Арендаторы»)
    const employeeDocs =
      params.category === 'tenants' && ownerIds.length
        ? await this.userModel
            .find({ parentTenantId: { $in: ownerIds } })
            .sort({ fullName: 1 })
            .lean()
        : [];
    const employeesByOwner = employeeDocs.reduce(
      (acc, e) => {
        const key = e.parentTenantId?.toString();
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(e);
        return acc;
      },
      {} as Record<string, typeof employeeDocs>,
    );

    const propertyIds = [
      ...new Set(
        users.flatMap((u) => (u.properties || []).map((p) => p.toString())),
      ),
    ];
    const properties = propertyIds.length
      ? await this.propertyModel.find({ _id: { $in: propertyIds } }).lean()
      : [];
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    const propertyMapByOffice = new Map<string, any>();
    const officePropertyIds = [
      ...new Set(officeLinks.map((o) => o.property.toString())),
    ];
    const officeProperties = officePropertyIds.length
      ? await this.propertyModel
          .find({ _id: { $in: officePropertyIds } })
          .lean()
      : [];
    officeProperties.forEach((p) =>
      propertyMapByOffice.set(p._id.toString(), p),
    );

    return {
      users: users.map((u) => {
        const ownerId = u._id.toString();
        const tenantOffices = (officesByTenant[ownerId] || []).map((o) =>
          this.mapOffice(o, propertyMapByOffice, new Map()),
        );
        const businessCenters = (u.properties || []).map((pid) => ({
          id: pid.toString(),
          name: propertyMap.get(pid.toString())?.name || 'БЦ',
        }));
        const team = (employeesByOwner[ownerId] || []).map((e) =>
          this.mapUser(e, countMap.get(e._id.toString()) || 0, [], [], {
            parentTenantName: u.fullName,
            company: e.company || u.company,
          }),
        );
        return this.mapUser(
          u,
          countMap.get(ownerId) || 0,
          tenantOffices,
          businessCenters,
          { employees: team },
        );
      }),
      total,
      counts,
    };
  }

  private async buildUserFilter(params: UserQuery) {
    const filter: Record<string, unknown> = {};

    if (params.category === 'tenants') {
      // Только владельцы компаний (без parentTenantId — это сотрудники)
      filter.role = 'tenant';
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { parentTenantId: null },
            { parentTenantId: { $exists: false } },
          ],
        },
      ];
    } else if (params.category === 'staff') {
      if (
        params.role &&
        STAFF_ROLES.includes(params.role as (typeof STAFF_ROLES)[number])
      ) {
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
      const rx = new RegExp(
        params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [
        { fullName: rx },
        { displayName: rx },
        { username: rx },
        { email: rx },
        { company: rx },
        { companyShortName: rx },
        { office: rx },
        { phone: rx },
        { passSubject: rx },
      ];
    }

    const isStaffCategory =
      params.category === 'staff' ||
      (params.role && params.role !== 'tenant' && !params.category);

    if (params.officeId?.trim()) {
      const office = await this.officeModel
        .findById(params.officeId.trim())
        .lean();
      const occupantIds = office
        ? collectOfficeTenantIds(office).map((id) => new Types.ObjectId(id))
        : [];
      if (occupantIds.length) {
        filter._id = { $in: occupantIds };
        filter.role = 'tenant';
      } else {
        filter._id = { $in: [] };
      }
    } else if (params.propertyId?.trim()) {
      const propertyObjectId = new Types.ObjectId(params.propertyId.trim());
      if (isStaffCategory) {
        filter.properties = propertyObjectId;
      } else {
        const offices = await this.officeModel
          .find({ property: propertyObjectId })
          .select('tenantId tenantIds')
          .lean();
        const occupantIds = [
          ...new Set(offices.flatMap((office) => collectOfficeTenantIds(office))),
        ].map((id) => new Types.ObjectId(id));
        filter._id = { $in: occupantIds };
        filter.role = 'tenant';
      }
    }

    return filter;
  }

  async createUser(dto: CreateUserDto, actor?: AuditActor) {
    const email = dto.email.toLowerCase();
    const existing = await this.userModel.findOne({ email });
    if (existing)
      throw new ConflictException('Пользователь с таким email уже существует');

    const hashed = await bcrypt.hash(dto.password, 10);
    let personName;
    try {
      personName = resolvePersonName(dto);
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }
    const username = await this.ensureUniqueUsername(dto.username);
    const identitySeed = applyUserIdentityDefaults({
      fullName: personName.fullName,
      company: dto.company,
      profileType: dto.profileType,
      legalForm: dto.legalForm,
      companyShortName: dto.companyShortName,
      employeeLimit: dto.employeeLimit ?? null,
      isActive: true,
      isBlocked: false,
      invitePending: false,
      role: dto.role,
    });
    const user = await this.userModel.create({
      email,
      username,
      fullName: personName.fullName,
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      phone: dto.phone,
      company: dto.company,
      companyLogo:
        dto.role === 'tenant'
          ? dto.companyLogo?.trim() || undefined
          : undefined,
      role: dto.role,
      office: dto.office,
      floor: dto.floor,
      password: hashed,
      isActive: true,
      emailVerified: dto.emailVerified ?? true,
      passSubject: identitySeed.passSubject,
      identityStatus: identitySeed.identityStatus,
      authVersion: identitySeed.authVersion,
      displayName: dto.displayName?.trim() || personName.fullName,
      profileType: identitySeed.profileType,
      legalForm: identitySeed.legalForm,
      companyShortName: dto.companyShortName?.trim() || undefined,
      employeeLimit: dto.employeeLimit ?? null,
      privateDataComplete: dto.privateDataComplete ?? false,
    } as any);

    if (dto.role === 'tenant' && dto.officeIds !== undefined) {
      await this.assignOfficesToTenant(user._id.toString(), dto.officeIds);
    }
    if (
      (dto.role === 'security' || dto.role === 'bc_admin') &&
      dto.propertyIds !== undefined
    ) {
      user.properties = dto.propertyIds.map((pid) => new Types.ObjectId(pid));
      await user.save();
    }

    const offices = await this.getTenantOffices(user._id.toString());
    const businessCenters = await this.getUserBusinessCenters(user);

    await this.syncResidentRecord(user);

    await this.auditService.log({
      action: 'user.create',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { email: user.email, role: user.role, fullName: user.fullName },
    });

    return { user: this.mapUser(user.toObject(), 0, offices, businessCenters) };
  }

  async getRegistrationRequests() {
    const users = await this.userModel
      .find({
        role: 'tenant',
        isActive: false,
        parentTenantId: { $exists: false },
        invitePending: { $ne: true },
      })
      .sort({ createdAt: -1 })
      .lean();

    return {
      count: users.length,
      requests: users.map((user) => this.mapUser(user, 0, [], [])),
    };
  }

  async approveRegistration(id: string, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.role !== 'tenant') {
      throw new BadRequestException(
        'Подтверждение доступно только для арендаторов',
      );
    }
    if (user.isActive) {
      throw new BadRequestException('Учётная запись уже активирована');
    }

    user.isActive = true;
    user.identityStatus = deriveIdentityStatus(user);
    if (!user.passSubject)
      user.passSubject = applyUserIdentityDefaults({}).passSubject;
    await user.save();
    await this.syncResidentRecord(user);

    await this.auditService.log({
      action: 'user.registration_approved',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
      },
    });

    const offices = await this.getTenantOffices(id);
    return { user: this.mapUser(user.toObject(), 0, offices, []) };
  }

  async rejectRegistration(id: string, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.role !== 'tenant') {
      throw new BadRequestException(
        'Отклонение доступно только для арендаторов',
      );
    }
    if (user.isActive) {
      throw new BadRequestException(
        'Нельзя отклонить уже активированную учётную запись',
      );
    }

    await this.auditService.log({
      action: 'user.registration_rejected',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
      },
    });

    await this.userModel.deleteOne({ _id: user._id });
    return { message: 'Заявка на регистрацию отклонена' };
  }

  async getProfileChangeRequests() {
    const users = await this.userModel
      .find({
        role: 'tenant',
        'profileChangeRequest.requestedAt': { $exists: true, $ne: null },
      })
      .sort({ 'profileChangeRequest.requestedAt': -1 })
      .lean();

    const items = await Promise.all(
      users.map(async (user) => {
        const offices = await this.getTenantOffices(user._id.toString());
        return {
          user: this.mapUser(user, 0, offices, []),
          request: mapProfileChangeRequest(user.profileChangeRequest),
        };
      }),
    );

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
    if (req.companyShortName !== undefined)
      user.companyShortName = req.companyShortName;
    if (req.profileType !== undefined) user.profileType = req.profileType;
    if (req.legalForm !== undefined) user.legalForm = req.legalForm;
    if (req.employeeLimit !== undefined) user.employeeLimit = req.employeeLimit;
    user.displayName = user.fullName;
    const approvedType = defaultProfileType(user);
    user.profileType = approvedType;
    user.legalForm = normalizeLegalForm(approvedType, user.legalForm);
    user.identityStatus = deriveIdentityStatus(user);
    user.profileChangeRequest = null;
    user.markModified('profileChangeRequest');
    await user.save();
    await this.syncResidentRecord(user);

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

  async updateUser(id: string, dto: UpdateUserDto, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');

    const prevRole = user.role;

    if (
      dto.fullName !== undefined ||
      dto.lastName !== undefined ||
      dto.firstName !== undefined ||
      dto.middleName !== undefined
    ) {
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
    const beforeIdentity = {
      isBlocked: user.isBlocked,
      isActive: user.isActive,
      parentTenantId: user.parentTenantId,
    };
    if (dto.username !== undefined) {
      const next = dto.username.trim().toLowerCase();
      const current = (user.username || '').trim().toLowerCase();
      if (!next) {
        user.set('username', undefined);
      } else if (next !== current) {
        user.username = await this.ensureUniqueUsername(dto.username, id);
      }
    }
    if (dto.emailVerified !== undefined) user.emailVerified = dto.emailVerified;
    if (dto.privateDataComplete !== undefined) {
      user.privateDataComplete = dto.privateDataComplete;
    }
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.company !== undefined) user.company = dto.company;
    if (dto.profileType !== undefined) user.profileType = dto.profileType;
    if (dto.legalForm !== undefined) user.legalForm = dto.legalForm;
    if (dto.companyShortName !== undefined) {
      user.companyShortName = dto.companyShortName?.trim() || undefined;
    }
    if (dto.employeeLimit !== undefined) {
      user.employeeLimit = dto.employeeLimit;
    }
    if (dto.isBlocked !== undefined) user.isBlocked = dto.isBlocked;
    if (dto.companyLogo !== undefined && !user.parentTenantId) {
      const logo = dto.companyLogo?.trim() || '';
      if (logo) user.companyLogo = logo;
      else user.set('companyLogo', undefined);
    }
    // Сотрудник компании: роль и parentTenantId не меняем через admin update
    if (dto.role !== undefined && !user.parentTenantId) {
      user.role = dto.role;
    }
    if (dto.office !== undefined && !user.parentTenantId)
      user.office = dto.office;
    if (dto.floor !== undefined && !user.parentTenantId) user.floor = dto.floor;
    if (dto.isActive !== undefined) {
      if (user.parentTenantId && user.invitePending && dto.isActive) {
        throw new BadRequestException(
          'Сотрудник ещё не принял приглашение — нельзя активировать до задания пароля по ссылке.',
        );
      }
      user.isActive = dto.isActive;
    }
    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
      user.authVersion = (user.authVersion || 1) + 1;
    }
    const nextType = defaultProfileType(user);
    user.profileType = nextType;
    user.legalForm = normalizeLegalForm(nextType, user.legalForm);
    user.displayName =
      (dto.displayName !== undefined
        ? dto.displayName.trim()
        : user.displayName) || user.fullName;
    if (!user.passSubject) {
      user.passSubject = applyUserIdentityDefaults({}).passSubject;
    }
    if (
      shouldBumpAuthVersion(beforeIdentity, {
        isBlocked: user.isBlocked,
        isActive: user.isActive,
        parentTenantId: user.parentTenantId,
      })
    ) {
      user.authVersion = (user.authVersion || 1) + 1;
    }
    user.identityStatus = deriveIdentityStatus(user);

    if (!user.parentTenantId) {
      if (dto.role && dto.role !== 'tenant' && prevRole === 'tenant') {
        await this.assignOfficesToTenant(id, []);
      }
      if (
        dto.role &&
        !['security', 'bc_admin'].includes(dto.role) &&
        ['security', 'bc_admin'].includes(prevRole)
      ) {
        user.properties = [];
      }
      if (dto.role === 'tenant' && prevRole !== 'tenant') {
        user.properties = [];
      }
      if (
        dto.propertyIds !== undefined &&
        ['security', 'bc_admin'].includes(user.role)
      ) {
        user.properties = dto.propertyIds.map((pid) => new Types.ObjectId(pid));
      }
    }

    await user.save();
    if (dto.username !== undefined && !user.username) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $unset: { username: 1 } },
      );
    }
    await this.syncResidentRecord(user);

    if (
      dto.officeIds !== undefined &&
      user.role === 'tenant' &&
      !user.parentTenantId
    ) {
      await this.assignOfficesToTenant(id, dto.officeIds);
    }

    const offices = await this.getTenantOffices(id);
    const passesCount = await this.passModel.countDocuments({
      createdBy: user._id,
    });
    const businessCenters = await this.getUserBusinessCenters(user);

    await this.auditService.log({
      action: 'user.update',
      entityType: 'user',
      entityId: user._id,
      actor,
      details: { email: user.email, role: user.role, isActive: user.isActive },
    });

    return {
      user: this.mapUser(
        user.toObject(),
        passesCount,
        offices,
        businessCenters,
      ),
    };
  }

  async updateBusinessCenter(
    id: string,
    dto: UpdateBusinessCenterDto,
    actor?: AuditActor,
  ) {
    const property = await this.propertyModel.findById(id);
    if (!property) throw new NotFoundException('Бизнес-центр не найден');
    await this.ensureBcAccess(property._id.toString(), actor);

    if (dto.name?.trim()) property.name = dto.name.trim();
    if (dto.address?.trim()) property.address = dto.address.trim();
    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (!code) {
        property.set('code', undefined);
      } else {
        const clash = await this.propertyModel.findOne({
          code,
          _id: { $ne: property._id },
        });
        if (clash) {
          throw new ConflictException(
            `Код «${code}» уже занят БЦ «${clash.name}»`,
          );
        }
        property.code = code;
      }
    }
    if (dto.passSettings) {
      property.settings = this.mergeBcPassSettings(
        property.settings,
        dto.passSettings,
      );
      property.markModified('settings');
    }
    await property.save();
    if (dto.code !== undefined && !dto.code.trim()) {
      await this.propertyModel.updateOne(
        { _id: property._id },
        { $unset: { code: 1 } },
      );
    }

    const stats = await this.officeModel.aggregate([
      { $match: { property: property._id, isActive: true } },
      {
        $group: {
          _id: '$property',
          count: { $sum: 1 },
          totalAreaSqm: { $sum: { $ifNull: ['$areaSqm', 0] } },
        },
      },
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
        code: property.code || undefined,
        officesCount: stats[0]?.count || 0,
        totalAreaSqm: stats[0]?.totalAreaSqm || 0,
        isActive: property.isActive,
        createdAt: (property as any).createdAt,
        passSettings: this.mapBcPassSettings(property.toObject()),
      },
    };
  }

  async getBusinessCenters(actor?: any) {
    await this.siteSource.collapseDuplicateCenters();
    const filter: Record<string, unknown> = {
      type: PropertyType.BUSINESS_CENTER,
      isActive: { $ne: false },
    };
    const scope = await this.getActorPropertyIds(actor);
    if (scope?.length)
      filter._id = { $in: scope.map((id) => new Types.ObjectId(id)) };

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
    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();
    const ranked = [...properties].sort((a, b) => {
      const aSite = /tf[_-]?business[_-]?center/i.test(String(a.code || ''))
        ? 1
        : 0;
      const bSite = /tf[_-]?business[_-]?center/i.test(String(b.code || ''))
        ? 1
        : 0;
      if (bSite !== aSite) return bSite - aSite;
      return (
        (statsMap.get(b._id.toString())?.count || 0) -
        (statsMap.get(a._id.toString())?.count || 0)
      );
    });
    const unique = ranked.filter((p) => {
      if (p.code) {
        if (seenCodes.has(p.code)) return false;
        seenCodes.add(p.code);
      }
      const name = normalizeBusinessCenterName(p.name);
      if (name) {
        if (seenNames.has(name)) return false;
        seenNames.add(name);
      }
      return true;
    });

    return {
      businessCenters: unique.map((p) => {
        const stats = statsMap.get(p._id.toString());
        return {
          id: p._id.toString(),
          name: p.name,
          address: p.address,
          code: p.code || undefined,
          officesCount: stats?.count || 0,
          totalAreaSqm: stats?.totalAreaSqm || 0,
          isActive: p.isActive,
          createdAt: (p as any).createdAt,
          passSettings: this.mapBcPassSettings(p),
        };
      }),
    };
  }

  async deleteBusinessCenter(id: string, actor?: AuditActor) {
    const property = await this.propertyModel.findById(id);
    if (!property || property.type !== PropertyType.BUSINESS_CENTER) {
      throw new NotFoundException('Бизнес-центр не найден');
    }
    await this.ensureBcAccess(property._id.toString(), actor);

    const propertyId = property._id;
    const [officesCount, passesCount, usersCount] = await Promise.all([
      this.officeModel.countDocuments({ property: propertyId }),
      this.passModel.countDocuments({ property: propertyId }),
      this.userModel.countDocuments({ properties: propertyId }),
    ]);

    if (officesCount > 0) {
      throw new BadRequestException(
        `Нельзя удалить БЦ: в нём ${officesCount} офис(ов). Сначала удалите или перенесите офисы.`,
      );
    }
    if (usersCount > 0) {
      throw new BadRequestException(
        `Нельзя удалить БЦ: ${usersCount} пользователь(ей) привязаны к этому объекту.`,
      );
    }

    // Пропуска не трогаем: офис/БЦ уже записаны в сам документ.
    await this.propertyModel.deleteOne({ _id: propertyId });

    await this.auditService.log({
      action: 'bc.delete',
      entityType: 'business_center',
      entityId: propertyId,
      actor,
      details: {
        name: property.name,
        address: property.address,
        passesKept: passesCount,
      },
    });

    return {
      message:
        passesCount > 0
          ? `Бизнес-центр удалён. ${passesCount} пропуск(ов) сохранены в истории.`
          : 'Бизнес-центр удалён',
      id: property._id.toString(),
      passesKept: passesCount,
    };
  }

  async createBusinessCenter(dto: CreateBusinessCenterDto, actor?: AuditActor) {
    const code = dto.code?.trim() || undefined;
    if (code) {
      const clash = await this.propertyModel.findOne({ code });
      if (clash) {
        throw new ConflictException(`Код «${code}» уже занят БЦ «${clash.name}»`);
      }
    }
    const property = await this.propertyModel.create({
      name: dto.name.trim(),
      address: dto.address.trim(),
      code,
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
        code: property.code || undefined,
        officesCount: 0,
        isActive: true,
        createdAt: (property as any).createdAt,
        passSettings: this.mapBcPassSettings(property.toObject()),
      },
    };
  }

  async exportOfficesCsv() {
    const { offices } = await this.getOffices();
    const { buildOfficeCsv } = await import('../common/office-csv.js');
    const tenantIds = [
      ...new Set(offices.flatMap((o) => o.tenantIds || (o.tenantId ? [o.tenantId] : []))),
    ].map((id) => new Types.ObjectId(id));
    const tenants = tenantIds.length
      ? await this.userModel.find({ _id: { $in: tenantIds } }).lean()
      : [];
    const tenantEmailMap = new Map(
      tenants.map((t) => [t._id.toString(), t.email || '']),
    );

    return buildOfficeCsv(
      offices.map((office) => ({
        businessCenterName: office.businessCenterName || '',
        number: office.number,
        floor: office.floor,
        areaSqm: office.areaSqm,
        company: office.company,
        tenantEmail: (office.tenantIds || (office.tenantId ? [office.tenantId] : []))
          .map((id) => tenantEmailMap.get(id))
          .filter(Boolean)
          .join(', ') || undefined,
        isActive: office.isActive,
      })),
    );
  }

  async importOfficesCsv(csv: string, actor?: AuditActor) {
    const { parseOfficeCsv } = await import('../common/office-csv.js');
    const parsed = parseOfficeCsv(csv);
    if (!parsed.rows.length && parsed.errors.length) {
      throw new BadRequestException(parsed.errors.join('; '));
    }

    const properties = await this.propertyModel.find({ isActive: true }).lean();
    const propertyByName = new Map(
      properties.map((p) => [p.name.trim().toLowerCase(), p]),
    );

    const tenantEmails = [
      ...new Set(parsed.rows.map((r) => r.tenantEmail).filter(Boolean)),
    ] as string[];
    const tenants = tenantEmails.length
      ? await this.userModel.find({ email: { $in: tenantEmails } }).lean()
      : [];
    const tenantByEmail = new Map(
      tenants.map((t) => [t.email!.toLowerCase(), t]),
    );

    const result = {
      created: 0,
      skipped: 0,
      errors: [...parsed.errors] as string[],
    };

    for (const [index, row] of parsed.rows.entries()) {
      const rowNum = index + 2;
      const property = propertyByName.get(row.businessCenter.toLowerCase());
      if (!property) {
        result.errors.push(
          `Строка ${rowNum}: БЦ «${row.businessCenter}» не найден`,
        );
        continue;
      }

      const existing = await this.officeModel.findOne({
        property: property._id,
        number: row.number.trim(),
      });
      if (existing) {
        result.skipped += 1;
        continue;
      }

      let tenantId: Types.ObjectId | undefined;
      if (row.tenantEmail) {
        const tenant = tenantByEmail.get(row.tenantEmail);
        if (!tenant) {
          result.errors.push(
            `Строка ${rowNum}: арендатор ${row.tenantEmail} не найден`,
          );
          continue;
        }
        tenantId = tenant._id;
      }

      const office = await this.officeModel.create({
        property: property._id,
        number: row.number.trim(),
        floor: row.floor,
        areaSqm: row.areaSqm,
        company: row.company,
        tenantId,
        tenantIds: tenantId ? [tenantId] : [],
        isActive: row.isActive,
      });

      if (tenantId) {
        await this.syncTenantProperties(tenantId.toString());
      }

      await this.auditService.log({
        action: 'office.import',
        entityType: 'office',
        entityId: office._id,
        actor,
        details: {
          number: office.number,
          propertyId: property._id.toString(),
          source: 'csv',
        },
      });

      result.created += 1;
    }

    return result;
  }

  async getOffices() {
    await this.siteSource.collapseDuplicateCenters();
    const offices = await this.officeModel
      .find()
      .sort({ createdAt: -1 })
      .lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const tenantIds = [
      ...new Set(offices.flatMap((o) => collectOfficeTenantIds(o))),
    ];

    const [properties, tenants] = await Promise.all([
      this.propertyModel.find({ _id: { $in: propertyIds } }).lean(),
      this.userModel.find({ _id: { $in: tenantIds } }).lean(),
    ]);

    const hidden = new Set(
      properties
        .filter((p) => p.isActive === false)
        .map((p) => p._id.toString()),
    );
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
    const visible = offices.filter(
      (o) => !hidden.has(o.property?.toString()),
    );

    return {
      offices: visible.map((o) => this.mapOffice(o, propertyMap, tenantMap)),
    };
  }

  async createOffice(dto: CreateOfficeDto, actor?: AuditActor) {
    const property = await this.propertyModel.findById(dto.propertyId);
    if (!property) throw new NotFoundException('Бизнес-центр не найден');

    const existing = await this.officeModel.findOne({
      property: dto.propertyId,
      number: dto.number.trim(),
    });
    if (existing)
      throw new ConflictException('Офис с таким номером уже есть в этом БЦ');

    const occupantOids = normalizeOfficeTenantIds(
      dto.tenantIds?.length
        ? dto.tenantIds
        : dto.tenantId
          ? [dto.tenantId]
          : [],
    );
    const office = await this.officeModel.create({
      property: new Types.ObjectId(dto.propertyId),
      number: dto.number.trim(),
      floor: dto.floor?.trim() || undefined,
      areaSqm: dto.areaSqm,
      company: dto.company?.trim(),
      tenantId: occupantOids[0],
      tenantIds: occupantOids,
      isActive: dto.isActive !== false,
      externalId: dto.externalId?.trim() || undefined,
    });

    for (const occupant of occupantOids) {
      await this.syncTenantProperties(occupant.toString());
    }

    const propertyMap = new Map([[property._id.toString(), property]]);
    const occupants = occupantOids.length
      ? await this.userModel.find({ _id: { $in: occupantOids } }).lean()
      : [];
    const tenantMap = new Map(occupants.map((t) => [t._id.toString(), t]));

    await this.auditService.log({
      action: 'office.create',
      entityType: 'office',
      entityId: office._id,
      actor,
      details: {
        number: office.number,
        floor: office.floor,
        propertyId: dto.propertyId,
      },
    });

    return {
      office: this.mapOffice(office.toObject(), propertyMap, tenantMap),
    };
  }

  async updateOffice(
    id: string,
    dto: Partial<CreateOfficeDto & { isActive: boolean }>,
    actor?: AuditActor,
  ) {
    const office = await this.officeModel.findById(id);
    if (!office) throw new NotFoundException('Офис не найден');

    const prevTenantIds = collectOfficeTenantIds(office);

    const nextPropertyId = dto.propertyId || office.property.toString();
    const nextNumber =
      dto.number !== undefined ? dto.number.trim() : office.number;
    if (dto.number !== undefined || dto.propertyId !== undefined) {
      const clash = await this.officeModel.findOne({
        property: nextPropertyId,
        number: nextNumber,
        _id: { $ne: office._id },
      });
      if (clash) {
        throw new ConflictException('Офис с таким номером уже есть в этом БЦ');
      }
    }
    if (dto.propertyId !== undefined) {
      const property = await this.propertyModel.findById(dto.propertyId);
      if (!property) throw new NotFoundException('Бизнес-центр не найден');
      office.property = new Types.ObjectId(dto.propertyId);
    }
    if (dto.number !== undefined) office.number = nextNumber;
    if (dto.floor !== undefined) office.floor = dto.floor.trim() || undefined;
    if (dto.externalId !== undefined) {
      const ext = dto.externalId.trim();
      if (ext) {
        const clash = await this.officeModel.findOne({
          externalId: ext,
          _id: { $ne: office._id },
        });
        if (clash) throw new ConflictException('externalId уже занят');
        office.externalId = ext;
      } else {
        office.set('externalId', undefined);
      }
    }
    if (dto.company !== undefined) office.company = dto.company?.trim();
    if (dto.areaSqm !== undefined) office.areaSqm = dto.areaSqm;
    if (dto.isActive !== undefined) office.isActive = dto.isActive;
    if (dto.tenantIds !== undefined || dto.tenantId !== undefined) {
      const nextIds = normalizeOfficeTenantIds(
        dto.tenantIds !== undefined
          ? dto.tenantIds
          : dto.tenantId
            ? [dto.tenantId]
            : [],
      );
      office.tenantIds = nextIds;
      if (nextIds.length) {
        office.tenantId = nextIds[0];
        if (dto.company === undefined && nextIds.length === 1) {
          const tenant = await this.userModel
            .findById(nextIds[0])
            .select('company')
            .lean();
          if (tenant?.company) office.company = tenant.company;
        }
      } else {
        office.set('tenantId', undefined);
      }
    }

    await office.save();

    if (dto.tenantIds !== undefined || dto.tenantId !== undefined) {
      const nextIds = collectOfficeTenantIds(office);
      if (!nextIds.length) {
        await this.officeModel.updateOne(
          { _id: office._id },
          { $unset: { tenantId: 1 }, $set: { tenantIds: [] } },
        );
      }
    }
    if (dto.externalId !== undefined && !dto.externalId.trim()) {
      await this.officeModel.updateOne(
        { _id: office._id },
        { $unset: { externalId: 1 } },
      );
    }

    const nextTenantIds = collectOfficeTenantIds(office);
    const syncIds = new Set([...prevTenantIds, ...nextTenantIds]);
    for (const occupantId of syncIds) {
      await this.syncTenantProperties(occupantId);
    }

    const property = await this.propertyModel.findById(office.property).lean();
    const occupants = nextTenantIds.length
      ? await this.userModel.find({ _id: { $in: nextTenantIds } }).lean()
      : [];
    const propertyMap = property
      ? new Map([[property._id.toString(), property]])
      : new Map();
    const tenantMap = new Map(occupants.map((t) => [t._id.toString(), t]));

    await this.auditService.log({
      action: 'office.update',
      entityType: 'office',
      entityId: office._id,
      actor,
      details: { number: office.number, isActive: office.isActive },
    });

    return {
      office: this.mapOffice(office.toObject(), propertyMap, tenantMap),
    };
  }

  async deleteOffice(id: string, actor?: AuditActor) {
    const office = await this.officeModel.findById(id);
    if (!office) throw new NotFoundException('Офис не найден');

    const officeObjectId = office._id;
    const [passesCount, templatesCount] = await Promise.all([
      this.passModel.countDocuments({ officeId: officeObjectId }),
      this.passTemplateModel.countDocuments({ officeId: officeObjectId }),
    ]);

    const prevTenantIds = collectOfficeTenantIds(office);
    const property = await this.propertyModel.findById(office.property).lean();

    // Шаблоны без живого офиса нельзя применить к новой заявке.
    if (templatesCount > 0) {
      await this.passTemplateModel.deleteMany({ officeId: officeObjectId });
    }

    // Пропуска не трогаем: номер/этаж/БЦ уже записаны в сам документ.
    await this.officeModel.deleteOne({ _id: officeObjectId });

    for (const occupantId of prevTenantIds) {
      await this.syncTenantProperties(occupantId);
    }

    await this.auditService.log({
      action: 'office.delete',
      entityType: 'office',
      entityId: officeObjectId,
      actor,
      details: {
        number: office.number,
        floor: office.floor,
        propertyId: office.property.toString(),
        businessCenterName: property?.name,
        passesKept: passesCount,
        templatesRemoved: templatesCount,
      },
    });

    return {
      message:
        passesCount > 0
          ? `Офис удалён. ${passesCount} пропуск(ов) сохранены в истории.`
          : 'Офис удалён',
      id: office._id.toString(),
      passesKept: passesCount,
      templatesRemoved: templatesCount,
    };
  }

  async seedTestData() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Создание тестовых данных доступно только в режиме разработки',
      );
    }
    const result = await this.testDataSeedService.seedTestData();
    return {
      ...result,
      tenants: result.users,
    };
  }

  async getTenantOffices(tenantId: string) {
    const offices = await this.officeModel
      .find({ ...officeAssignedToQuery(tenantId), isActive: true })
      .sort({ number: 1 })
      .lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const properties = await this.propertyModel
      .find({ _id: { $in: propertyIds } })
      .lean();
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
    return offices.map((o) => this.mapOffice(o, propertyMap, new Map()));
  }

  private async assignOfficesToTenant(tenantId: string, officeIds: string[]) {
    const tenantOid = new Types.ObjectId(tenantId);
    const targetOids = officeIds.map((id) => new Types.ObjectId(id));
    const targetIdSet = new Set(officeIds);

    const current = await this.officeModel
      .find(officeAssignedToQuery(tenantOid))
      .select('tenantId tenantIds company')
      .lean();
    const affectedTenantIds = new Set<string>([tenantId]);
    for (const office of current) {
      for (const occupant of collectOfficeTenantIds(office)) {
        affectedTenantIds.add(occupant);
      }
    }

    const toRemove = current.filter((o) => !targetIdSet.has(o._id.toString()));
    for (const office of toRemove) {
      const next = collectOfficeTenantIds(office).filter((id) => id !== tenantId);
      const write = officeTenantWrite(normalizeOfficeTenantIds(next));
      await this.officeModel.updateOne({ _id: office._id }, write);
    }

    if (targetOids.length) {
      const tenant = await this.userModel
        .findById(tenantId)
        .select('company')
        .lean();
      const targets = await this.officeModel
        .find({ _id: { $in: targetOids } })
        .select('tenantId tenantIds company')
        .lean();
      for (const office of targets) {
        for (const occupant of collectOfficeTenantIds(office)) {
          affectedTenantIds.add(occupant);
        }
        const next = collectOfficeTenantIds(office);
        if (!next.includes(tenantId)) next.push(tenantId);
        const oids = normalizeOfficeTenantIds(next);
        const write = officeTenantWrite(oids);
        if (oids.length === 1 && tenant?.company && !office.company) {
          write.$set = { ...write.$set, company: tenant.company };
        }
        await this.officeModel.updateOne({ _id: office._id }, write);
      }
    }

    for (const id of affectedTenantIds) {
      await this.syncTenantProperties(id);
    }
  }

  private async syncTenantProperties(tenantId: string) {
    if (!tenantId || !Types.ObjectId.isValid(tenantId)) return;
    const offices = await this.officeModel
      .find({ ...officeAssignedToQuery(tenantId), isActive: true })
      .lean();
    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const primary = offices[0];

    await this.userModel.findByIdAndUpdate(tenantId, {
      properties: propertyIds.map((id) => new Types.ObjectId(id)),
      ...(primary
        ? {
            office: primary.number,
            floor: primary.floor,
            // company офиса не затираем company пользователя, если у user уже есть
          }
        : { office: '', floor: '' }),
    });
  }

  /**
   * Удаление пользователя админом.
   * - tenant owner: нельзя, если есть сотрудники; офисы отвязываются
   * - employee (parentTenantId): пропуска переназначаются owner
   * - staff/admin: нельзя удалить последнего admin / себя
   */
  async deleteUser(id: string, actor?: AuditActor) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (actor?.userId && actor.userId === id) {
      throw new BadRequestException(
        'Нельзя удалить собственную учётную запись',
      );
    }

    if (user.role === 'admin') {
      const activeAdmins = await this.userModel.countDocuments({
        role: 'admin',
        isActive: { $ne: false },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'Нельзя удалить последнего администратора',
        );
      }
    }

    const isTenantOwner = user.role === 'tenant' && !user.parentTenantId;
    const isEmployee = !!user.parentTenantId;

    if (isTenantOwner) {
      const employeesCount = await this.userModel.countDocuments({
        parentTenantId: user._id,
      });
      if (employeesCount > 0) {
        throw new BadRequestException(
          `Нельзя удалить арендатора: у компании ${employeesCount} сотрудник(ов). Сначала удалите сотрудников (из профиля владельца или перенесите учётные записи).`,
        );
      }
      const linked = await this.officeModel
        .find(officeAssignedToQuery(user._id))
        .select('tenantId tenantIds')
        .lean();
      for (const office of linked) {
        const next = collectOfficeTenantIds(office).filter(
          (id) => id !== user._id.toString(),
        );
        await this.officeModel.updateOne(
          { _id: office._id },
          officeTenantWrite(normalizeOfficeTenantIds(next)),
        );
      }
    }

    if (isEmployee) {
      await this.passModel.updateMany(
        { createdBy: user._id },
        { $set: { createdBy: user.parentTenantId } },
      );
    }

    const snapshot = {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      company: user.company,
      parentTenantId: user.parentTenantId?.toString(),
    };

    await this.userModel.deleteOne({ _id: user._id });

    await this.auditService.log({
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      actor,
      details: snapshot,
    });

    return { message: 'Пользователь удалён', id };
  }

  private mapOffice(
    office: any,
    propertyMap: Map<string, any>,
    tenantMap: Map<string, any>,
  ) {
    const property = propertyMap.get(office.property?.toString());
    const occupantIds = collectOfficeTenantIds(office);
    const tenants = occupantIds
      .map((id) => tenantMap.get(id))
      .filter(Boolean);
    const primary = tenants[0] || null;
    return {
      id: office._id.toString(),
      propertyId: office.property?.toString(),
      businessCenterName: property?.name,
      number: office.number,
      title: office.title || undefined,
      floor: office.floor || undefined,
      areaSqm: office.areaSqm,
      company: office.company,
      availability: office.availability || undefined,
      officeFormat: office.officeFormat || undefined,
      busyUntil: office.busyUntil || undefined,
      roomStatus: office.roomStatus || undefined,
      paymentStatus: office.paymentStatus || undefined,
      paidUntil: office.paidUntil || undefined,
      tenantId: occupantIds[0],
      tenantIds: occupantIds,
      tenantName: primary?.fullName,
      tenants: tenants.map((t) => ({
        id: t._id.toString(),
        name: t.fullName,
        company: t.company,
      })),
      isActive: office.isActive,
      externalId: office.externalId,
      createdAt: office.createdAt,
    };
  }

  private async ensureUniqueUsername(
    raw?: string,
    exceptId?: string,
  ): Promise<string | undefined> {
    const username = raw?.trim().toLowerCase() || undefined;
    if (!username) return undefined;
    const clash = await this.userModel.findOne({
      username,
      ...(exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}),
    });
    if (clash) throw new ConflictException('Логин уже занят');
    return username;
  }

  private async getUserBusinessCenters(user: any) {
    if (!user.properties?.length) return [];
    const properties = await this.propertyModel
      .find({ _id: { $in: user.properties } })
      .lean();
    return properties.map((p) => ({ id: p._id.toString(), name: p.name }));
  }

  private mapUser(
    user: any,
    passesCount: number,
    offices: any[] = [],
    businessCenters: { id: string; name: string }[] = [],
    extra?: {
      employees?: any[];
      parentTenantName?: string;
      company?: string;
    },
  ) {
    const nameParts =
      user.lastName || user.firstName
        ? {
            lastName: user.lastName || '',
            firstName: user.firstName || '',
            middleName: user.middleName || '',
          }
        : splitFullName(user.fullName);
    const parentTenantId = user.parentTenantId?.toString() || undefined;
    const invitePending = !!user.invitePending;
    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username || undefined,
      emailVerified: !!user.emailVerified,
      lastLoginAt: user.lastLoginAt || undefined,
      fullName: user.fullName,
      lastName: nameParts.lastName,
      firstName: nameParts.firstName,
      middleName: nameParts.middleName,
      phone: user.phone,
      company: extra?.company ?? user.company,
      companyLogo: user.companyLogo || undefined,
      role: user.role || 'tenant',
      office: user.office,
      floor: user.floor,
      isActive: user.isActive !== false && !invitePending,
      invitePending,
      inviteExpiresAt: user.inviteExpiresAt || undefined,
      parentTenantId,
      parentTenantName: extra?.parentTenantName,
      isTenantOwner:
        (user.role === 'tenant' || user.role === 'tenant_employee') &&
        !parentTenantId,
      createdAt: user.createdAt,
      passesCount,
      offices,
      businessCenters,
      propertyIds: businessCenters.map((bc) => bc.id),
      profileChangeRequest: mapProfileChangeRequest(user.profileChangeRequest),
      employees: extra?.employees,
      employeesCount: extra?.employees?.length ?? undefined,
      isBlocked: !!user.isBlocked,
      ...identityView(user),
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
    const maps = String(s.route_maps_provider || 'yandex').toLowerCase();
    return {
      auto_approve_delivery: s.auto_approve_delivery || 'false',
      working_hours_from: s.working_hours_from || '08:00',
      working_hours_to: s.working_hours_to || '20:00',
      contact_phone: s.contact_phone || '+7 (495) 000-00-00',
      contact_email: s.contact_email || 'reception@pass24.local',
      reception_floor: s.reception_floor || '1',
      require_checkout: s.require_checkout !== 'false' ? 'true' : 'false',
      closed_weekdays: s.closed_weekdays || '',
      route_maps_provider: maps === 'google' ? 'google' : 'yandex',
    };
  }

  private mergeBcPassSettings(
    current: Record<string, unknown> | undefined,
    dto: BusinessCenterPassSettingsDto,
  ) {
    const settings = { ...(current || {}) };
    if (dto.auto_approve_delivery !== undefined)
      settings.auto_approve_delivery = dto.auto_approve_delivery;
    if (dto.working_hours_from !== undefined)
      settings.working_hours_from = dto.working_hours_from;
    if (dto.working_hours_to !== undefined)
      settings.working_hours_to = dto.working_hours_to;
    if (dto.contact_phone !== undefined)
      settings.contact_phone = dto.contact_phone;
    if (dto.contact_email !== undefined)
      settings.contact_email = dto.contact_email;
    if (dto.reception_floor !== undefined)
      settings.reception_floor = dto.reception_floor;
    if (dto.require_checkout !== undefined)
      settings.require_checkout = dto.require_checkout;
    if (dto.closed_weekdays !== undefined)
      settings.closed_weekdays = dto.closed_weekdays;
    if (dto.route_maps_provider !== undefined) {
      const maps = String(dto.route_maps_provider || 'yandex').toLowerCase();
      settings.route_maps_provider = maps === 'google' ? 'google' : 'yandex';
    }
    return settings;
  }

  private countBy(arr: any[], key: string) {
    return arr.reduce(
      (acc, item) => {
        const val = item[key] || 'unknown';
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
