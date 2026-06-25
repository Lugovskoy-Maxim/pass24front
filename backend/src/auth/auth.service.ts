import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { Office, OfficeDocument, Property, PropertyDocument, User, UserDocument } from '../schemas';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Office.name) private officeModel: Model<OfficeDocument>,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
    private jwtService: JwtService,
    private accessConfigService: AccessConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      fullName: dto.fullName,
      phone: dto.phone,
      company: dto.company,
      role: 'tenant',
      office: dto.office,
      floor: dto.floor,
      password: hashed, // Note: we need to add password field to schema temporarily
    } as any);

    const offices = await this.getUserOffices(user._id.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() }).select('+password') as any;

    if (!user) {
      // Auto-create test users on first login attempt for demo
      if (['tenant@pass24.local', 'security@pass24.local', 'admin@pass24.local'].includes(dto.email)) {
        return this.createTestUser(dto.email, dto.password);
      }
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const isValid = await bcrypt.compare(dto.password, user.password || '');
    if (!isValid) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const offices = await this.getUserOffices(user._id.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
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
      phone: user.phone,
      company: user.company,
      role: user.role || 'tenant',
      office: user.office,
      floor: user.floor,
      offices,
      permissions,
      enabledPassTypes,
    };
  }

  private async createTestUser(email: string, password: string) {
    const role = email.includes('admin') ? 'admin' : email.includes('security') ? 'security' : 'tenant';
    const fullName = email.includes('admin') ? 'Администратор БЦ' : email.includes('security') ? 'Сотрудник охраны' : 'Арендатор Тестовый';

    const hashed = await bcrypt.hash(password, 10);

    let user = await this.userModel.findOne({ email });
    if (!user) {
      user = await this.userModel.create({
        email,
        fullName,
        role,
        password: hashed,
        isActive: true,
      } as any);
    }

    const offices = await this.getUserOffices(user._id.toString());
    const token = this.generateToken(user);
    return { user: await this.toUserDto(user, offices), token };
  }
}
