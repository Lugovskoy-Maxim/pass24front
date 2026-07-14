import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { resolvePersonName, splitFullName } from '../common/person-name';
import { mapProfileChangeRequest, profileFieldsEqual } from '../common/profile-change';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { normalizeRuMobilePhone } from '../common/phone';
import {
  Office,
  OfficeDocument,
  Property,
  PropertyDocument,
  RegistrationPending,
  RegistrationPendingDocument,
  User,
  UserDocument,
} from '../schemas';
import { parseClosedWeekdays } from '../common/bookable-visit-dates';
import { resolveTenantOwnerId } from '../common/tenant-owner';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DEV_TEST_ACCOUNTS, DEV_TEST_ACCOUNT_EMAILS } from '../database/dev-test-accounts';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    @InjectModel(RegistrationPending.name, AUTH_CONNECTION)
    private pendingModel: Model<RegistrationPendingDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    private jwtService: JwtService,
    private accessConfigService: AccessConfigService,
    private auditService: AuditService,
    private mailService: MailService,
    private smsService: SmsService,
  ) {}

  async requestRegistrationCode(dto: RegisterDto) {
    const email = dto.email?.toLowerCase().trim() || undefined;
    const phone = normalizeRuMobilePhone(dto.phone);
    const channel = this.resolveVerificationChannel(dto, email, phone);

    if (channel === 'email' && !email) {
      throw new BadRequestException('Укажите email для подтверждения');
    }
    if (channel === 'phone' && !phone) {
      throw new BadRequestException('Укажите номер телефона в формате +79XXXXXXXXX');
    }

    if (email) {
      const existingEmail = await this.userModel.findOne({ email });
      if (existingEmail) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }
    if (phone) {
      const existingPhone = await this.userModel.findOne({ phone });
      if (existingPhone) {
        throw new ConflictException('Пользователь с таким телефоном уже существует');
      }
    }

    let personName;
    try {
      personName = resolvePersonName(dto);
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const pendingKey = channel === 'phone' ? { phone } : { email };

    const pendingData: Record<string, unknown> = {
      verificationChannel: channel,
      codeHash,
      expiresAt,
      password: passwordHash,
      fullName: personName.fullName,
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      company: dto.company.trim(),
    };
    if (email) pendingData.email = email;
    if (phone) pendingData.phone = phone;

    await this.pendingModel.findOneAndUpdate(
      pendingKey,
      pendingData,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (channel === 'phone') {
      await this.smsService.sendRegistrationCode(phone!, code);
    } else {
      await this.mailService.sendRegistrationCode(email!, code);
    }

    return {
      verificationRequired: true,
      verificationChannel: channel,
      message: channel === 'phone'
        ? `Код подтверждения отправлен на ${phone}`
        : `Код подтверждения отправлен на ${email}`,
      expiresInMinutes: 15,
    };
  }

  async confirmRegistration(dto: ConfirmRegistrationDto) {
    const email = dto.email?.toLowerCase().trim() || undefined;
    const phone = normalizeRuMobilePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException('Укажите email или телефон');
    }

    const pendingFilter = phone ? { phone } : { email };
    const pending = await this.pendingModel
      .findOne(pendingFilter)
      .select('+codeHash +password')
      .lean();

    if (!pending) {
      throw new BadRequestException('Код не найден. Запросите новый код регистрации.');
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await this.pendingModel.deleteOne(pendingFilter);
      throw new BadRequestException('Код истёк. Запросите новый код регистрации.');
    }

    const codeOk = await bcrypt.compare(dto.code, pending.codeHash);
    if (!codeOk) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    if (pending.email) {
      const existingEmail = await this.userModel.findOne({ email: pending.email });
      if (existingEmail) {
        await this.pendingModel.deleteOne(pendingFilter);
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }
    if (pending.phone) {
      const existingPhone = await this.userModel.findOne({ phone: pending.phone });
      if (existingPhone) {
        await this.pendingModel.deleteOne(pendingFilter);
        throw new ConflictException('Пользователь с таким телефоном уже существует');
      }
    }

    const user = await this.userModel.create({
      email: pending.email,
      phone: pending.phone,
      fullName: pending.fullName,
      lastName: pending.lastName,
      firstName: pending.firstName,
      middleName: pending.middleName,
      company: pending.company,
      role: 'tenant',
      password: pending.password,
      isActive: false,
    } as any);

    await this.pendingModel.deleteOne(pendingFilter);

    await this.auditService.log({
      action: 'user.registration_request',
      entityType: 'user',
      entityId: user._id,
      details: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
        phone: user.phone,
        verificationChannel: pending.verificationChannel,
      },
    });

    return {
      pendingApproval: true,
      message: 'Заявка отправлена. Доступ будет открыт после подтверждения администратором.',
    };
  }

  /** @deprecated Используйте requestRegistrationCode + confirmRegistration */
  async register(dto: RegisterDto) {
    return this.requestRegistrationCode(dto);
  }

  async login(dto: LoginDto) {
    const loginRaw = (dto.login || dto.email || '').trim();
    if (!loginRaw) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const login = loginRaw.toLowerCase();
    const phone = normalizeRuMobilePhone(loginRaw);
    const orConditions: Record<string, string>[] = [{ username: login }, { email: login }];
    if (phone) orConditions.push({ phone });

    const user = await this.userModel.findOne({
      $or: orConditions,
    }).select('+password') as any;

    if (!user) {
      if (DEV_TEST_ACCOUNT_EMAILS.has(login)) {
        return this.createTestUser(login, dto.password);
      }
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const isValid = await bcrypt.compare(dto.password, user.password || '');
    if (!isValid) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    if (user.isActive === false) {
      throw new ForbiddenException(
        'Учётная запись ожидает подтверждения администратором. Вход будет доступен после одобрения заявки.',
      );
    }

    const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (user.isActive === false) {
      throw new ForbiddenException('Учётная запись не активирована');
    }
    const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
    return { user: await this.toUserDto(user, offices) };
  }

  async requestProfileChange(userId: string, dto: UpdateProfileDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (user.parentTenantId) {
      throw new ForbiddenException('Сотрудники компании не могут изменять профиль — обратитесь к владельцу аккаунта');
    }
    if (user.role !== 'tenant') {
      throw new ForbiddenException('Редактирование профиля доступно только арендаторам');
    }

    let personName;
    try {
      personName = resolvePersonName({
        lastName: dto.lastName,
        firstName: dto.firstName,
        middleName: dto.middleName,
      });
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }

    const current = user.lastName || user.firstName
      ? {
          lastName: user.lastName || '',
          firstName: user.firstName || '',
          middleName: user.middleName || '',
        }
      : splitFullName(user.fullName);

    const requested = {
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      phone: dto.phone?.trim() || '',
      company: dto.company?.trim() || '',
    };

    if (profileFieldsEqual(
      { ...current, phone: user.phone || '', company: user.company || '' },
      requested,
    )) {
      throw new BadRequestException('Нет изменений для отправки на подтверждение');
    }

    user.profileChangeRequest = {
      lastName: requested.lastName,
      firstName: requested.firstName,
      middleName: requested.middleName,
      fullName: personName.fullName,
      phone: requested.phone || undefined,
      company: requested.company || undefined,
      requestedAt: new Date(),
    };
    user.markModified('profileChangeRequest');
    await user.save();

    await this.auditService.log({
      action: 'profile.change_request',
      entityType: 'user',
      entityId: user._id,
      actor: { userId, email: user.email, role: user.role },
      details: {
        fullName: personName.fullName,
        phone: requested.phone || undefined,
        company: requested.company || undefined,
      },
    });

    const offices = await this.getUserOffices(userId);
    return { user: await this.toUserDto(user, offices) };
  }

  async cancelProfileChange(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (!user.profileChangeRequest?.requestedAt) {
      throw new BadRequestException('Нет заявки на изменение профиля');
    }
    user.profileChangeRequest = null;
    user.markModified('profileChangeRequest');
    await user.save();
    const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
    return { user: await this.toUserDto(user, offices) };
  }

  async listTenantEmployees(userId: string) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new UnauthorizedException();
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Управление сотрудниками доступно только владельцу компании');
    }

    const employees = await this.userModel
      .find({ parentTenantId: owner._id })
      .sort({ createdAt: -1 })
      .lean();

    const { roles } = await this.accessConfigService.getEmployeeAssignableRoles();
    const roleLabelMap = new Map(roles.map((item) => [item.key, item.label]));

    return {
      employees: employees.map((e) => ({
        id: e._id.toString(),
        email: e.email,
        full_name: e.fullName,
        last_name: e.lastName,
        first_name: e.firstName,
        middle_name: e.middleName,
        phone: e.phone,
        is_active: e.isActive !== false,
        role: e.role,
        role_label: roleLabelMap.get(e.role) || e.role,
        created_at: (e as any).createdAt,
      })),
    };
  }

  async addTenantEmployee(userId: string, dto: CreateTenantEmployeeDto) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new UnauthorizedException();
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Добавлять сотрудников может только владелец компании');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    let personName;
    try {
      personName = resolvePersonName({
        lastName: dto.lastName,
        firstName: dto.firstName,
        middleName: dto.middleName,
      });
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }

    const assignable = await this.accessConfigService.getEmployeeAssignableRoles();
    const employeeRole = dto.role || assignable.roles[0]?.key;
    if (!employeeRole) {
      throw new BadRequestException('Сначала создайте тип пользователя в разделе «Права и типы пропусков»');
    }
    await this.accessConfigService.assertEmployeeRole(employeeRole);
    const roleLabel = assignable.roles.find((item) => item.key === employeeRole)?.label || employeeRole;

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const employee = await this.userModel.create({
      email,
      fullName: personName.fullName,
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      phone: dto.phone?.trim() || undefined,
      company: owner.company,
      role: employeeRole,
      parentTenantId: owner._id,
      password: passwordHash,
      isActive: true,
    } as any);

    await this.auditService.log({
      action: 'tenant.employee_added',
      entityType: 'user',
      entityId: employee._id,
      actor: { userId, email: owner.email, role: owner.role },
      details: {
        employeeEmail: email,
        employeeName: personName.fullName,
        ownerCompany: owner.company,
        employeeRole,
        employeeRoleLabel: roleLabel,
      },
    });

    return {
      employee: {
        id: employee._id.toString(),
        email: employee.email,
        full_name: employee.fullName,
        last_name: employee.lastName,
        first_name: employee.firstName,
        middle_name: employee.middleName,
        phone: employee.phone,
        is_active: true,
        role: employee.role,
        role_label: roleLabel,
        created_at: (employee as any).createdAt,
      },
    };
  }

  async removeTenantEmployee(userId: string, employeeId: string) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new UnauthorizedException();
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Удалять сотрудников может только владелец компании');
    }

    const employee = await this.userModel.findById(employeeId);
    if (!employee || employee.parentTenantId?.toString() !== owner._id.toString()) {
      throw new NotFoundException('Сотрудник не найден');
    }

    employee.isActive = false;
    await employee.save();

    await this.auditService.log({
      action: 'tenant.employee_removed',
      entityType: 'user',
      entityId: employee._id,
      actor: { userId, email: owner.email, role: owner.role },
      details: { employeeEmail: employee.email, employeeName: employee.fullName },
    });

    return { message: 'Сотрудник деактивирован' };
  }

  async getUserOffices(userId: string, parentTenantId?: string) {
    const ownerId = resolveTenantOwnerId({ userId, parentTenantId }) || userId;
    const offices = await this.officeModel.find({ tenantId: new Types.ObjectId(ownerId), isActive: true }).lean();
    if (!offices.length) return [];

    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const properties = await this.propertyModel.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    return offices.map((o) => {
      const property = propertyMap.get(o.property.toString());
      const ps = property?.settings || {};
      return {
        id: o._id.toString(),
        propertyId: o.property.toString(),
        businessCenterName: property?.name,
        number: o.number,
        floor: o.floor,
        company: o.company,
        workingHoursFrom: ps.working_hours_from || '08:00',
        workingHoursTo: ps.working_hours_to || '20:00',
        closedWeekdays: parseClosedWeekdays(ps.closed_weekdays),
      };
    });
  }

  private resolveVerificationChannel(
    dto: RegisterDto,
    email?: string,
    phone?: string | null,
  ): 'email' | 'phone' {
    if (dto.verificationChannel === 'phone') {
      if (!phone) throw new BadRequestException('Укажите корректный номер телефона в формате +79XXXXXXXXX');
      return 'phone';
    }
    if (dto.verificationChannel === 'email') {
      if (!email) throw new BadRequestException('Укажите email');
      return 'email';
    }
    if (phone && !email) return 'phone';
    if (email) return 'email';
    throw new BadRequestException('Укажите email или телефон для подтверждения регистрации');
  }

  private generateToken(user: any) {
    return this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
  }

  private async toUserDto(user: any, offices: any[] = []) {
    const role = user.role || 'tenant';
    const permissions = await this.accessConfigService.getPermissionsForRole(role);
    const { enabledPassTypes, roleLabels } = await this.accessConfigService.getConfig();
    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      full_name: user.fullName,
      last_name: user.lastName,
      first_name: user.firstName,
      middle_name: user.middleName,
      phone: user.phone,
      company: user.company,
      role,
      role_label: roleLabels?.[role] || role,
      office: user.office,
      floor: user.floor,
      offices,
      permissions,
      enabledPassTypes,
      parent_tenant_id: user.parentTenantId?.toString(),
      is_tenant_owner: user.role === 'tenant' && !user.parentTenantId,
      profile_change_request: mapProfileChangeRequest(user.profileChangeRequest),
    };
  }

  getDevAccounts() {
    if (process.env.NODE_ENV === 'production') {
      return { accounts: [] as Array<{ label: string; email: string; password: string; role: string }> };
    }

    return {
      accounts: DEV_TEST_ACCOUNTS.map(({ label, email, password, role }) => ({
        label,
        email,
        password,
        role,
      })),
    };
  }

  private async createTestUser(email: string, password: string) {
    const account = DEV_TEST_ACCOUNTS.find((item) => item.email === email.toLowerCase());
    if (!account) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const hashed = await bcrypt.hash(password, 10);

    let user = await this.userModel.findOne({ email: account.email });
    if (!user) {
      user = await this.userModel.create({
        email: account.email,
        fullName: account.fullName,
        company: account.company,
        office: account.office,
        floor: account.floor,
        role: account.role,
        password: hashed,
        isActive: true,
      } as any);
    }

    const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }
}
