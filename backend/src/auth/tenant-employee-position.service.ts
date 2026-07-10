import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessConfigService } from '../access/access-config.service';
import {
  DEFAULT_TENANT_EMPLOYEE_CATEGORY_PERMISSIONS,
  sanitizeTenantEmployeePermissions,
  TENANT_EMPLOYEE_ASSIGNABLE_PERMISSION_META,
} from '../access/tenant-employee-permissions';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import {
  TenantEmployeePosition,
  TenantEmployeePositionDocument,
  User,
  UserDocument,
} from '../schemas';
import { CreateTenantEmployeePositionDto } from './dto/create-tenant-employee-position.dto';
import { UpdateTenantEmployeePositionDto } from './dto/update-tenant-employee-position.dto';

@Injectable()
export class TenantEmployeePositionService {
  constructor(
    @InjectModel(TenantEmployeePosition.name, AUTH_CONNECTION)
    private positionModel: Model<TenantEmployeePositionDocument>,
    @InjectModel(User.name, AUTH_CONNECTION)
    private userModel: Model<UserDocument>,
    private accessConfigService: AccessConfigService,
  ) {}

  private mapPosition(doc: TenantEmployeePositionDocument | Record<string, any>) {
    return {
      id: doc._id.toString(),
      name: doc.name,
      permissions: doc.permissions || [],
      is_default: !!doc.isDefault,
      created_at: (doc as any).createdAt,
      updated_at: (doc as any).updatedAt,
    };
  }

  async assertSuperAdmin(userId: string) {
    const actor = await this.userModel.findById(userId);
    if (!actor || actor.role !== 'admin') {
      throw new ForbiddenException('Управление должностями доступно только супер-администратору');
    }
    return actor;
  }

  async ensureDefaultPosition() {
    let position = await this.positionModel.findOne({ isDefault: true });
    if (position) return position;

    const anyPosition = await this.positionModel.findOne().sort({ createdAt: 1 });
    if (anyPosition) {
      anyPosition.isDefault = true;
      await anyPosition.save();
      return anyPosition;
    }

    position = await this.positionModel.create({
      name: 'Базовый',
      permissions: [...DEFAULT_TENANT_EMPLOYEE_CATEGORY_PERMISSIONS],
      isDefault: true,
    });
    return position;
  }

  async listPositions() {
    await this.ensureDefaultPosition();
    const positions = await this.positionModel.find().sort({ isDefault: -1, name: 1 }).lean();
    return {
      positions: positions.map((position) => this.mapPosition(position)),
      assignablePermissions: TENANT_EMPLOYEE_ASSIGNABLE_PERMISSION_META,
    };
  }

  async listPositionsForTenantOwner(userId: string) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new ForbiddenException('Пользователь не найден');
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Список должностей доступен только владельцу компании');
    }
    return this.listPositions();
  }

  async createPosition(userId: string, dto: CreateTenantEmployeePositionDto) {
    await this.assertSuperAdmin(userId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Укажите название должности');

    const permissions = sanitizeTenantEmployeePermissions(dto.permissions);
    if (!permissions.length) {
      throw new BadRequestException('Выберите хотя бы одно право для должности');
    }

    const existing = await this.positionModel.findOne({ name });
    if (existing) {
      throw new BadRequestException('Должность с таким названием уже существует');
    }

    if (dto.isDefault) {
      await this.positionModel.updateMany({}, { $set: { isDefault: false } });
    }

    const hasDefault = await this.positionModel.exists({ isDefault: true });
    const position = await this.positionModel.create({
      name,
      permissions,
      isDefault: dto.isDefault ?? !hasDefault,
    });

    return { position: this.mapPosition(position) };
  }

  async updatePosition(userId: string, positionId: string, dto: UpdateTenantEmployeePositionDto) {
    await this.assertSuperAdmin(userId);
    const position = await this.positionModel.findById(positionId);
    if (!position) throw new NotFoundException('Должность не найдена');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Укажите название должности');
      const duplicate = await this.positionModel.findOne({ name, _id: { $ne: position._id } });
      if (duplicate) throw new BadRequestException('Должность с таким названием уже существует');
      position.name = name;
    }

    if (dto.permissions !== undefined) {
      const permissions = sanitizeTenantEmployeePermissions(dto.permissions);
      if (!permissions.length) {
        throw new BadRequestException('Выберите хотя бы одно право для должности');
      }
      position.permissions = permissions;
    }

    if (dto.isDefault === true) {
      await this.positionModel.updateMany({ _id: { $ne: position._id } }, { $set: { isDefault: false } });
      position.isDefault = true;
    } else if (dto.isDefault === false && position.isDefault) {
      throw new BadRequestException('Нельзя снять флаг должности по умолчанию — назначьте другую');
    }

    await position.save();
    return { position: this.mapPosition(position) };
  }

  async deletePosition(userId: string, positionId: string) {
    await this.assertSuperAdmin(userId);
    const position = await this.positionModel.findById(positionId);
    if (!position) throw new NotFoundException('Должность не найдена');

    const assignedCount = await this.userModel.countDocuments({
      parentTenantId: { $exists: true, $ne: null },
      employeePositionId: position._id,
      isActive: { $ne: false },
    });
    if (assignedCount > 0) {
      throw new BadRequestException('Нельзя удалить должность: к ней привязаны сотрудники');
    }

    const wasDefault = position.isDefault;
    await position.deleteOne();

    if (wasDefault) {
      const fallback = await this.positionModel.findOne().sort({ createdAt: 1 });
      if (fallback) {
        fallback.isDefault = true;
        await fallback.save();
      }
    }

    return { message: 'Должность удалена' };
  }

  async resolvePositionForEmployee(positionId?: string) {
    if (positionId) {
      const position = await this.positionModel.findById(positionId);
      if (!position) throw new NotFoundException('Должность сотрудника не найдена');
      return position;
    }
    return this.ensureDefaultPosition();
  }

  async getPositionMap() {
    const positions = await this.positionModel.find().lean();
    return new Map(positions.map((position) => [position._id.toString(), position]));
  }

  async resolveUserPermissions(user: UserDocument | Record<string, any>): Promise<string[]> {
    if (user.parentTenantId) {
      const positionId = user.employeePositionId || (user as any).employeeCategoryId;
      if (positionId) {
        const position = await this.positionModel.findById(positionId).lean();
        if (position?.permissions?.length) {
          return sanitizeTenantEmployeePermissions(position.permissions);
        }
      }
      const fallback = await this.ensureDefaultPosition();
      return sanitizeTenantEmployeePermissions(fallback.permissions);
    }

    return this.accessConfigService.getPermissionsForRole(user.role || 'tenant');
  }
}