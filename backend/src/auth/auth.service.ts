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
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { BUILTIN_EMPLOYEE_ROLE, BUILTIN_EMPLOYEE_ROLE_LABELS } from '../access/access.constants';
import { AuditService } from '../audit/audit.service';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { normalizeRuMobilePhone } from '../common/phone';
import {
  isAllowedRegistrationEmail,
  REGISTRATION_EMAIL_POLICY_MESSAGE,
} from '../common/email-policy';
import {
  Office,
  OfficeDocument,
  Pass,
  PassDocument,
  Property,
  PropertyDocument,
  RegistrationPending,
  RegistrationPendingDocument,
  User,
  UserDocument,
} from '../schemas';
import { parseClosedWeekdays } from '../common/bookable-visit-dates';
import { resolveTenantOwnerId } from '../common/tenant-owner';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ConfirmEmailVerifyDto } from './dto/confirm-email-verify.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DEV_TEST_ACCOUNTS, DEV_TEST_ACCOUNT_EMAILS } from '../database/dev-test-accounts';
import { SiteSettingsService } from '../site-settings/site-settings.service';

/** Антиспам: SMS OTP регистрации — не чаще 1 раза за интервал. */
const SMS_RESEND_INTERVAL_MS = 5 * 60 * 1000;
/** Антиспам для email OTP (сброс пароля, verify email, resend invite). */
const EMAIL_CODE_RESEND_INTERVAL_MS = 5 * 60 * 1000;
/** TTL одноразовых кодов (регистрация / reset / verify). */
const CODE_TTL_MS = 15 * 60 * 1000;
/** Срок жизни ссылки-приглашения сотрудника. */
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const INVITE_TTL_HOURS = 72;

/**
 * Идентичность: login, регистрация (email/SMS), password reset, email verify,
 * CRUD сотрудников арендатора, профиль.
 *
 * User / RegistrationPending — AUTH_CONNECTION (pass24_auth).
 * Office / Property / Pass — default connection (pass24).
 *
 * Модель арендатора:
 * - role=tenant, без parentTenantId → владелец компании
 * - parentTenantId → сотрудник (роль tenant_employee)
 * После register/confirm пользователь isActive=false до одобрения админом.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    @InjectModel(RegistrationPending.name, AUTH_CONNECTION)
    private pendingModel: Model<RegistrationPendingDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    /** Нужен для переназначения пропусков при удалении сотрудника. */
    @InjectModel(Pass.name) private passModel: Model<PassDocument>,
    private jwtService: JwtService,
    private accessConfigService: AccessConfigService,
    private auditService: AuditService,
    private mailService: MailService,
    private smsService: SmsService,
    private siteSettingsService: SiteSettingsService,
  ) {}

  /**
   * Шаг 1 регистрации: сохраняет pending + шлёт OTP (email или SMS).
   * passwordConfirm обязателен; SMS rate-limit по lastCodeSentAt pending.
   */
  async requestRegistrationCode(dto: RegisterDto) {
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Пароли не совпадают');
    }

    const email = dto.email?.toLowerCase().trim() || undefined;
    const phone = normalizeRuMobilePhone(dto.phone);
    const channel = this.resolveVerificationChannel(dto, email, phone);

    if (channel === 'email' && !email) {
      throw new BadRequestException('Укажите email для подтверждения');
    }
    if (channel === 'phone' && !phone) {
      throw new BadRequestException('Укажите номер телефона в формате +79XXXXXXXXX');
    }
    let siteSettings = await this.siteSettingsService.get();
    // Email (основной или доп. при SMS): зона .ru + список запрещённых доменов из админки
    if (email && !isAllowedRegistrationEmail(email, { blockedDomains: siteSettings.blockedEmailDomains })) {
      throw new BadRequestException(REGISTRATION_EMAIL_POLICY_MESSAGE);
    }
    if (channel === 'phone') {
      if (!siteSettings.smsRegistrationEnabled) {
        throw new BadRequestException(siteSettings.smsRegistrationDisabledMessage);
      }
    }

    if (email) {
      const existingEmail = await this.findUserByEmail(email);
      if (existingEmail) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }
    if (phone) {
      const existingPhone = await this.findUserByPhone(phone);
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

    const pendingKey = channel === 'phone' ? { phone } : { email };
    const existingPending = await this.pendingModel.findOne(pendingKey).lean();

    if (channel === 'phone' && existingPending?.lastCodeSentAt) {
      const retryAfterSeconds = this.getRetryAfterSeconds(
        existingPending.lastCodeSentAt,
        SMS_RESEND_INTERVAL_MS,
      );
      if (retryAfterSeconds > 0) {
        throw new BadRequestException(
          `Повторная отправка SMS возможна через ${this.formatRetryWait(retryAfterSeconds)}. Не чаще 1 раза в 5 минут.`,
        );
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    const pendingData: Record<string, unknown> = {
      verificationChannel: channel,
      codeHash,
      expiresAt,
      lastCodeSentAt: now,
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
      await this.smsService.sendRegistrationCode(phone!, code, siteSettings.smsRegistrationCodeText);
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
      retryAfterSeconds: channel === 'phone' ? Math.floor(SMS_RESEND_INTERVAL_MS / 1000) : 0,
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
      const emailPolicy = await this.siteSettingsService.get();
      if (!isAllowedRegistrationEmail(pending.email, { blockedDomains: emailPolicy.blockedEmailDomains })) {
        await this.pendingModel.deleteOne(pendingFilter);
        throw new BadRequestException(REGISTRATION_EMAIL_POLICY_MESSAGE);
      }
      const existingEmail = await this.findUserByEmail(pending.email);
      if (existingEmail) {
        await this.pendingModel.deleteOne(pendingFilter);
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }
    if (pending.phone) {
      const existingPhone = await this.findUserByPhone(pending.phone);
      if (existingPhone) {
        await this.pendingModel.deleteOne(pendingFilter);
        throw new ConflictException('Пользователь с таким телефоном уже существует');
      }
    }

    const emailVerified = pending.verificationChannel === 'email' && !!pending.email;

    let user: UserDocument;
    try {
      user = await this.userModel.create({
        email: pending.email || undefined,
        phone: pending.phone || undefined,
        fullName: pending.fullName,
        lastName: pending.lastName,
        firstName: pending.firstName,
        middleName: pending.middleName,
        company: pending.company,
        role: 'tenant',
        password: pending.password,
        isActive: false,
        emailVerified,
      } as any);
    } catch (err) {
      await this.pendingModel.deleteOne(pendingFilter);
      throw this.mapUserCreateConflict(err);
    }

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

  /**
   * @deprecated LEGACY alias для старых клиентов.
   * Эквивалент requestRegistrationCode; не добавляйте новую логику сюда.
   */
  async register(dto: RegisterDto) {
    return this.requestRegistrationCode(dto);
  }

  /** Сброс пароля по email. Если аккаунта нет — предлагаем contact admin (recoveryChannel). */
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const email = dto.email.toLowerCase().trim();
    const siteSettings = await this.siteSettingsService.get();
    const adminContact = {
      phone: siteSettings.sitePhone || undefined,
      email: siteSettings.siteEmail || undefined,
    };

    const user = await this.userModel
      .findOne({ email })
      .select('+passwordResetCodeHash')
      .exec();

    if (!user) {
      return {
        recoveryChannel: 'admin' as const,
        message:
          'Аккаунт с таким email не найден. Восстановление по почте недоступно — свяжитесь с администратором.',
        contact: adminContact,
      };
    }

    if (!user.email) {
      return {
        recoveryChannel: 'admin' as const,
        message:
          'У этой учётной записи нет email. Восстановление пароля — через администратора.',
        contact: adminContact,
      };
    }

    if (user.passwordResetLastSentAt) {
      const retryAfterSeconds = this.getRetryAfterSeconds(
        user.passwordResetLastSentAt,
        EMAIL_CODE_RESEND_INTERVAL_MS,
      );
      if (retryAfterSeconds > 0) {
        throw new BadRequestException(
          `Повторная отправка кода возможна через ${this.formatRetryWait(retryAfterSeconds)}. Не чаще 1 раза в 5 минут.`,
        );
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const now = new Date();
    user.passwordResetCodeHash = codeHash;
    user.passwordResetExpiresAt = new Date(now.getTime() + CODE_TTL_MS);
    user.passwordResetLastSentAt = now;
    await user.save();

    await this.mailService.sendPasswordResetCode(email, code);

    return {
      recoveryChannel: 'email' as const,
      message: `Код восстановления отправлен на ${email}`,
      expiresInMinutes: 15,
      retryAfterSeconds: Math.floor(EMAIL_CODE_RESEND_INTERVAL_MS / 1000),
      contact: adminContact,
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Пароли не совпадают');
    }

    const email = dto.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email })
      .select('+password +passwordResetCodeHash')
      .exec();

    if (!user?.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      throw new BadRequestException('Код не найден. Запросите восстановление пароля заново.');
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $unset: { passwordResetCodeHash: 1, passwordResetExpiresAt: 1 } },
      );
      throw new BadRequestException('Код истёк. Запросите восстановление пароля заново.');
    }

    const codeOk = await bcrypt.compare(dto.code, user.passwordResetCodeHash);
    if (!codeOk) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          password: passwordHash,
          ...(user.email ? { emailVerified: true } : {}),
        },
        $unset: {
          passwordResetCodeHash: 1,
          passwordResetExpiresAt: 1,
          passwordResetLastSentAt: 1,
        },
      },
    );

    await this.auditService.log({
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user._id,
      details: { email: user.email },
    });

    return {
      message: 'Пароль успешно изменён. Войдите с новым паролем.',
    };
  }

  /** JWT-пользователь: код на свой email, если emailVerified=false. */
  async requestEmailVerification(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+emailVerifyCodeHash')
      .exec();
    if (!user) throw new UnauthorizedException();

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'У аккаунта нет email. Обратитесь к администратору, чтобы указать почту.',
      );
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email уже подтверждён');
    }

    if (user.emailVerifyLastSentAt) {
      const retryAfterSeconds = this.getRetryAfterSeconds(
        user.emailVerifyLastSentAt,
        EMAIL_CODE_RESEND_INTERVAL_MS,
      );
      if (retryAfterSeconds > 0) {
        throw new BadRequestException(
          `Повторная отправка кода возможна через ${this.formatRetryWait(retryAfterSeconds)}. Не чаще 1 раза в 5 минут.`,
        );
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const now = new Date();
    user.emailVerifyCodeHash = codeHash;
    user.emailVerifyExpiresAt = new Date(now.getTime() + CODE_TTL_MS);
    user.emailVerifyLastSentAt = now;
    await user.save();

    await this.mailService.sendEmailVerificationCode(email, code);

    return {
      message: `Код подтверждения отправлен на ${email}`,
      expiresInMinutes: 15,
      retryAfterSeconds: Math.floor(EMAIL_CODE_RESEND_INTERVAL_MS / 1000),
    };
  }

  async confirmEmailVerification(userId: string, dto: ConfirmEmailVerifyDto) {
    const user = await this.userModel
      .findById(userId)
      .select('+emailVerifyCodeHash')
      .exec();
    if (!user) throw new UnauthorizedException();

    if (!user.email) {
      throw new BadRequestException('У аккаунта нет email');
    }

    if (user.emailVerified) {
      const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
      return {
        message: 'Email уже подтверждён',
        user: await this.toUserDto(user, offices),
      };
    }

    if (!user.emailVerifyCodeHash || !user.emailVerifyExpiresAt) {
      throw new BadRequestException('Сначала запросите код подтверждения');
    }

    if (user.emailVerifyExpiresAt.getTime() < Date.now()) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $unset: { emailVerifyCodeHash: 1, emailVerifyExpiresAt: 1 } },
      );
      throw new BadRequestException('Код истёк. Запросите новый код.');
    }

    const codeOk = await bcrypt.compare(dto.code, user.emailVerifyCodeHash);
    if (!codeOk) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: { emailVerified: true },
        $unset: {
          emailVerifyCodeHash: 1,
          emailVerifyExpiresAt: 1,
          emailVerifyLastSentAt: 1,
        },
      },
    );

    user.emailVerified = true;

    await this.auditService.log({
      action: 'user.email_verified',
      entityType: 'user',
      entityId: user._id,
      actor: { userId, email: user.email, role: user.role },
      details: { email: user.email },
    });

    const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
    return {
      message: 'Email успешно подтверждён',
      user: await this.toUserDto(user, offices),
    };
  }

  /**
   * Вход по username | email | телефону.
   * dto.email — LEGACY-поле для старых клиентов (дублирует login).
   * createTestUser — только dev (DEV_TEST_ACCOUNTS), не production.
   */
  async login(dto: LoginDto) {
    const loginRaw = (dto.login || dto.email || '').trim();
    if (!loginRaw) {
      throw new UnauthorizedException('Неверный логин или пароль');
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
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (user.invitePending) {
      throw new UnauthorizedException(
        'Аккаунт ещё не активирован. Откройте ссылку из письма-приглашения и задайте пароль.',
      );
    }

    const isValid = await bcrypt.compare(dto.password, user.password || '');
    if (!isValid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    // Отключённый сотрудник — нельзя войти (владелец с isActive=false может — ждёт одобрения)
    if (user.parentTenantId && user.isActive === false) {
      throw new UnauthorizedException(
        'Учётная запись отключена владельцем компании. Обратитесь к руководителю.',
      );
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Учётная запись заблокирована');
    }

    const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
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
      employees: employees.map((e) => this.mapEmployeeDto(e, roleLabelMap)),
    };
  }

  /**
   * Пригласить сотрудника: без пароля, письмо со ссылкой (72 ч).
   * isActive=false, invitePending=true до accept.
   */
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

    const employeeRole = BUILTIN_EMPLOYEE_ROLE;
    await this.accessConfigService.assertEmployeeRole(employeeRole);
    const roleLabel = BUILTIN_EMPLOYEE_ROLE_LABELS[employeeRole] || 'Сотрудник компании';

    const { rawToken, tokenHash, expiresAt } = this.createInviteToken();
    // Случайный хэш — вход по паролю невозможен, пока не примут invite
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

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
      password: placeholderPassword,
      isActive: false,
      invitePending: true,
      inviteTokenHash: tokenHash,
      inviteExpiresAt: expiresAt,
      inviteLastSentAt: new Date(),
      emailVerified: false,
    } as any);

    await this.mailService.sendEmployeeInvite({
      to: email,
      inviteUrl: this.buildInviteUrl(rawToken),
      employeeName: personName.fullName,
      companyName: owner.company,
      inviterName: owner.fullName,
      expiresHours: INVITE_TTL_HOURS,
    });

    await this.auditService.log({
      action: 'tenant.employee_invited',
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
      message: `Приглашение отправлено на ${email}`,
      employee: this.mapEmployeeDto(employee.toObject ? employee.toObject() : employee),
    };
  }

  /** Повторная отправка invite (rate limit 5 мин). */
  async resendTenantEmployeeInvite(userId: string, employeeId: string) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new UnauthorizedException();
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Управлять сотрудниками может только владелец компании');
    }

    const employee = await this.userModel
      .findById(employeeId)
      .select('+inviteTokenHash')
      .exec();
    if (!employee || employee.parentTenantId?.toString() !== owner._id.toString()) {
      throw new NotFoundException('Сотрудник не найден');
    }
    if (!employee.invitePending) {
      throw new BadRequestException('Сотрудник уже активировал аккаунт — приглашение не требуется');
    }

    if (employee.inviteLastSentAt) {
      const retryAfterSeconds = this.getRetryAfterSeconds(
        employee.inviteLastSentAt,
        EMAIL_CODE_RESEND_INTERVAL_MS,
      );
      if (retryAfterSeconds > 0) {
        throw new BadRequestException(
          `Повторная отправка возможна через ${this.formatRetryWait(retryAfterSeconds)}. Не чаще 1 раза в 5 минут.`,
        );
      }
    }

    const { rawToken, tokenHash, expiresAt } = this.createInviteToken();
    employee.inviteTokenHash = tokenHash;
    employee.inviteExpiresAt = expiresAt;
    employee.inviteLastSentAt = new Date();
    employee.isActive = false;
    await employee.save();

    await this.mailService.sendEmployeeInvite({
      to: employee.email!,
      inviteUrl: this.buildInviteUrl(rawToken),
      employeeName: employee.fullName || '',
      companyName: owner.company,
      inviterName: owner.fullName,
      expiresHours: INVITE_TTL_HOURS,
    });

    return {
      message: `Приглашение повторно отправлено на ${employee.email}`,
      employee: this.mapEmployeeDto(employee.toObject()),
      retryAfterSeconds: Math.floor(EMAIL_CODE_RESEND_INTERVAL_MS / 1000),
    };
  }

  /** Публично: проверить токен приглашения (для страницы /invite). */
  async getInviteInfo(token: string) {
    const employee = await this.findEmployeeByInviteToken(token);
    return {
      valid: true,
      email: employee.email,
      full_name: employee.fullName,
      company: employee.company,
      expires_at: employee.inviteExpiresAt,
    };
  }

  /** Публично: задать пароль по invite-токену и активировать. */
  async acceptInvite(dto: AcceptInviteDto) {
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Пароли не совпадают');
    }

    const employee = await this.findEmployeeByInviteToken(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.userModel.updateOne(
      { _id: employee._id },
      {
        $set: {
          password: passwordHash,
          isActive: true,
          invitePending: false,
          emailVerified: true,
        },
        $unset: {
          inviteTokenHash: 1,
          inviteExpiresAt: 1,
          inviteLastSentAt: 1,
        },
      },
    );

    await this.auditService.log({
      action: 'tenant.employee_invite_accepted',
      entityType: 'user',
      entityId: employee._id,
      details: { email: employee.email },
    });

    return {
      message: 'Пароль задан. Войдите с email и новым паролем.',
      email: employee.email,
    };
  }

  /** Вкл/выкл. Нельзя «включить» invitePending — только resend + accept. */
  async setTenantEmployeeActive(userId: string, employeeId: string, isActive: boolean) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new UnauthorizedException();
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Управлять сотрудниками может только владелец компании');
    }

    const employee = await this.userModel.findById(employeeId);
    if (!employee || employee.parentTenantId?.toString() !== owner._id.toString()) {
      throw new NotFoundException('Сотрудник не найден');
    }

    if (isActive && employee.invitePending) {
      throw new BadRequestException(
        'Сотрудник ещё не принял приглашение. Отправьте ссылку повторно — после задания пароля аккаунт станет активным.',
      );
    }

    employee.isActive = !!isActive;
    await employee.save();

    await this.auditService.log({
      action: isActive ? 'tenant.employee_enabled' : 'tenant.employee_disabled',
      entityType: 'user',
      entityId: employee._id,
      actor: { userId, email: owner.email, role: owner.role },
      details: {
        employeeEmail: employee.email,
        employeeName: employee.fullName,
        isActive: !!isActive,
      },
    });

    return {
      message: isActive ? 'Сотрудник включён' : 'Сотрудник отключён',
      employee: this.mapEmployeeDto(employee.toObject()),
    };
  }

  private createInviteToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    return { rawToken, tokenHash, expiresAt };
  }

  private buildInviteUrl(rawToken: string): string {
    return `${this.mailService.getPublicAppOrigin()}/invite/${rawToken}`;
  }

  private async findEmployeeByInviteToken(rawToken: string): Promise<UserDocument> {
    const token = (rawToken || '').trim();
    if (!token || token.length < 32) {
      throw new BadRequestException('Некорректная ссылка приглашения');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const employee = await this.userModel
      .findOne({ inviteTokenHash: tokenHash, invitePending: true })
      .select('+inviteTokenHash')
      .exec();

    if (!employee) {
      throw new BadRequestException('Ссылка приглашения недействительна или уже использована');
    }
    if (!employee.inviteExpiresAt || employee.inviteExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Срок действия ссылки истёк (72 часа). Попросите руководителя отправить приглашение снова.',
      );
    }
    return employee;
  }

  private mapEmployeeDto(
    e: any,
    roleLabelMap?: Map<string, string>,
  ) {
    const role = e.role || BUILTIN_EMPLOYEE_ROLE;
    const roleLabel =
      roleLabelMap?.get(role)
      || BUILTIN_EMPLOYEE_ROLE_LABELS[role]
      || role;
    const invitePending = !!e.invitePending;
    return {
      id: e._id.toString(),
      email: e.email,
      full_name: e.fullName,
      last_name: e.lastName,
      first_name: e.firstName,
      middle_name: e.middleName,
      phone: e.phone,
      is_active: e.isActive !== false && !invitePending,
      invite_pending: invitePending,
      invite_expires_at: e.inviteExpiresAt || undefined,
      role,
      role_label: roleLabel,
      created_at: e.createdAt,
    };
  }

  /**
   * Полное удаление сотрудника (не soft-delete).
   * Пропуска переназначаются owner — иначе createdBy указывал бы на удалённый _id
   * и пропадал из company list.
   */
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

    const snapshot = {
      employeeEmail: employee.email,
      employeeName: employee.fullName,
    };

    const reassignResult = await this.passModel.updateMany(
      { createdBy: employee._id },
      { $set: { createdBy: owner._id } },
    );

    await this.userModel.deleteOne({ _id: employee._id });

    await this.auditService.log({
      action: 'tenant.employee_deleted',
      entityType: 'user',
      entityId: employeeId,
      actor: { userId, email: owner.email, role: owner.role },
      details: {
        ...snapshot,
        reassignedPasses: reassignResult.modifiedCount || 0,
      },
    });

    return { message: 'Сотрудник удалён' };
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

  /** Варианты хранения телефона в БД (старые записи, разные форматы ввода). */
  private phoneLookupVariants(phone: string): string[] {
    const normalized = normalizeRuMobilePhone(phone);
    if (!normalized) return [phone.trim()].filter(Boolean);
    const digits = normalized.replace(/\D/g, '');
    return [...new Set([
      normalized,
      digits,
      `+${digits}`,
      digits.startsWith('7') ? `8${digits.slice(1)}` : '',
    ].filter(Boolean))];
  }

  private async findUserByPhone(phone: string) {
    const variants = this.phoneLookupVariants(phone);
    if (!variants.length) return null;
    return this.userModel.findOne({ phone: { $in: variants } });
  }

  private async findUserByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    if (!normalized) return null;
    return this.userModel.findOne({ email: normalized });
  }

  /** Mongo E11000 → понятный 409 вместо Internal Server Error. */
  private mapUserCreateConflict(err: unknown): never {
    const code = err && typeof err === 'object' && 'code' in err
      ? (err as { code?: number }).code
      : undefined;
    if (code === 11000) {
      const key = String(
        (err as { keyPattern?: Record<string, unknown>; message?: string }).keyPattern
          ? Object.keys((err as { keyPattern: Record<string, unknown> }).keyPattern).join(',')
          : (err as { message?: string }).message || '',
      ).toLowerCase();
      if (key.includes('phone')) {
        throw new ConflictException('Пользователь с таким телефоном уже существует');
      }
      if (key.includes('email')) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
      throw new ConflictException('Пользователь с таким email или телефоном уже существует');
    }
    throw err;
  }

  private getRetryAfterSeconds(lastSentAt: Date, intervalMs: number): number {
    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    if (elapsed >= intervalMs) return 0;
    return Math.ceil((intervalMs - elapsed) / 1000);
  }

  private formatRetryWait(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins <= 0) return `${secs} сек.`;
    if (secs === 0) return `${mins} мин.`;
    return `${mins} мин. ${secs} сек.`;
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
    const propertyIds = (user.properties || []).map((p: { toString: () => string }) => p.toString());
    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      email_verified: !!user.emailVerified,
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
      property_ids: propertyIds,
      permissions,
      enabledPassTypes,
      parent_tenant_id: user.parentTenantId?.toString(),
      is_tenant_owner: user.role === 'tenant' && !user.parentTenantId,
      is_active: user.isActive !== false,
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
      throw new UnauthorizedException('Неверный логин или пароль');
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
        emailVerified: true,
      } as any);
    }

    const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }
}
