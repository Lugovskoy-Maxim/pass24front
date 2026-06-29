import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { resolvePersonName, splitFullName } from '../common/person-name';
import { mapProfileChangeRequest, profileFieldsEqual } from '../common/profile-change';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { Office, OfficeDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DEV_TEST_ACCOUNTS, DEV_TEST_ACCOUNT_EMAILS } from '../database/dev-test-accounts';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    private jwtService: JwtService,
    private accessConfigService: AccessConfigService,
    private auditService: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    let personName;
    try {
      personName = resolvePersonName(dto);
    } catch {
      throw new BadRequestException('Укажите фамилию и имя');
    }

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      fullName: personName.fullName,
      lastName: personName.lastName,
      firstName: personName.firstName,
      middleName: personName.middleName,
      phone: dto.phone?.trim() || undefined,
      company: dto.company.trim(),
      role: 'tenant',
      password: hashed,
      isActive: false,
    } as any);

    await this.auditService.log({
      action: 'user.registration_request',
      entityType: 'user',
      entityId: user._id,
      details: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
        phone: user.phone,
      },
    });

    return {
      pendingApproval: true,
      message: 'Заявка отправлена. Доступ будет открыт после подтверждения администратором.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).select('+password') as any;

    if (!user) {
      if (DEV_TEST_ACCOUNT_EMAILS.has(dto.email.toLowerCase())) {
        return this.createTestUser(dto.email, dto.password);
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

    const offices = await this.getUserOffices(user._id.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (user.isActive === false) {
      throw new ForbiddenException('Учётная запись не активирована');
    }
    const offices = await this.getUserOffices(userId);
    return { user: await this.toUserDto(user, offices) };
  }

  async requestProfileChange(userId: string, dto: UpdateProfileDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
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
    const offices = await this.getUserOffices(userId);
    return { user: await this.toUserDto(user, offices) };
  }

  async getUserOffices(userId: string) {
    const offices = await this.officeModel.find({ tenantId: new Types.ObjectId(userId), isActive: true }).lean();
    if (!offices.length) return [];

    const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
    const properties = await this.propertyModel.find({ _id: { $in: propertyIds } }).lean();
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    return offices.map((o) => ({
      id: o._id.toString(),
      propertyId: o.property.toString(),
      businessCenterName: propertyMap.get(o.property.toString())?.name,
      number: o.number,
      floor: o.floor,
      company: o.company,
    }));
  }

  private generateToken(user: any) {
    return this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
  }

  private async toUserDto(user: any, offices: any[] = []) {
    const permissions = await this.accessConfigService.getPermissionsForRole(user.role || 'tenant');
    const { enabledPassTypes } = await this.accessConfigService.getConfig();
    return {
      id: user._id.toString(),
      email: user.email,
      full_name: user.fullName,
      last_name: user.lastName,
      first_name: user.firstName,
      middle_name: user.middleName,
      phone: user.phone,
      company: user.company,
      role: user.role || 'tenant',
      office: user.office,
      floor: user.floor,
      offices,
      permissions,
      enabledPassTypes,
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

    const offices = await this.getUserOffices(user._id.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }
}
