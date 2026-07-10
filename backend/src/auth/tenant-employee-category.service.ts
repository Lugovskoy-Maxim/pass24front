import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessConfigService } from '../access/access-config.service';
import {
  DEFAULT_TENANT_EMPLOYEE_CATEGORY_PERMISSIONS,
  sanitizeTenantEmployeePermissions,
  TENANT_EMPLOYEE_ASSIGNABLE_PERMISSION_META,
} from '../access/tenant-employee-permissions';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import {
  TenantEmployeeCategory,
  TenantEmployeeCategoryDocument,
  User,
  UserDocument,
} from '../schemas';
import { CreateTenantEmployeeCategoryDto } from './dto/create-tenant-employee-category.dto';
import { UpdateTenantEmployeeCategoryDto } from './dto/update-tenant-employee-category.dto';

@Injectable()
export class TenantEmployeeCategoryService {
  constructor(
    @InjectModel(TenantEmployeeCategory.name, AUTH_CONNECTION)
    private categoryModel: Model<TenantEmployeeCategoryDocument>,
    @InjectModel(User.name, AUTH_CONNECTION)
    private userModel: Model<UserDocument>,
    private accessConfigService: AccessConfigService,
  ) {}

  async assertTenantOwner(userId: string) {
    const owner = await this.userModel.findById(userId);
    if (!owner) throw new ForbiddenException('Пользователь не найден');
    if (owner.role !== 'tenant' || owner.parentTenantId) {
      throw new ForbiddenException('Управление категориями доступно только владельцу компании');
    }
    return owner;
  }

  private mapCategory(doc: TenantEmployeeCategoryDocument | Record<string, any>) {
    return {
      id: doc._id.toString(),
      name: doc.name,
      permissions: doc.permissions || [],
      is_default: !!doc.isDefault,
      created_at: (doc as any).createdAt,
      updated_at: (doc as any).updatedAt,
    };
  }

  async ensureDefaultCategory(ownerId: string | Types.ObjectId) {
    const ownerObjectId = new Types.ObjectId(ownerId);
    let category = await this.categoryModel.findOne({ ownerTenantId: ownerObjectId, isDefault: true });
    if (category) return category;

    const anyCategory = await this.categoryModel.findOne({ ownerTenantId: ownerObjectId }).sort({ createdAt: 1 });
    if (anyCategory) {
      anyCategory.isDefault = true;
      await anyCategory.save();
      return anyCategory;
    }

    category = await this.categoryModel.create({
      ownerTenantId: ownerObjectId,
      name: 'Базовый',
      permissions: [...DEFAULT_TENANT_EMPLOYEE_CATEGORY_PERMISSIONS],
      isDefault: true,
    });
    return category;
  }

  async listCategories(userId: string) {
    await this.assertTenantOwner(userId);
    await this.ensureDefaultCategory(userId);

    const categories = await this.categoryModel
      .find({ ownerTenantId: new Types.ObjectId(userId) })
      .sort({ isDefault: -1, name: 1 })
      .lean();

    return {
      categories: categories.map((category) => this.mapCategory(category)),
      assignablePermissions: TENANT_EMPLOYEE_ASSIGNABLE_PERMISSION_META,
    };
  }

  async createCategory(userId: string, dto: CreateTenantEmployeeCategoryDto) {
    await this.assertTenantOwner(userId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Укажите название категории');

    const permissions = sanitizeTenantEmployeePermissions(dto.permissions);
    if (!permissions.length) {
      throw new BadRequestException('Выберите хотя бы одно право для категории');
    }

    const ownerObjectId = new Types.ObjectId(userId);
    const existing = await this.categoryModel.findOne({ ownerTenantId: ownerObjectId, name });
    if (existing) {
      throw new BadRequestException('Категория с таким названием уже существует');
    }

    if (dto.isDefault) {
      await this.categoryModel.updateMany(
        { ownerTenantId: ownerObjectId },
        { $set: { isDefault: false } },
      );
    }

    const hasDefault = await this.categoryModel.exists({ ownerTenantId: ownerObjectId, isDefault: true });
    const category = await this.categoryModel.create({
      ownerTenantId: ownerObjectId,
      name,
      permissions,
      isDefault: dto.isDefault ?? !hasDefault,
    });

    return { category: this.mapCategory(category) };
  }

  async updateCategory(userId: string, categoryId: string, dto: UpdateTenantEmployeeCategoryDto) {
    await this.assertTenantOwner(userId);
    const category = await this.categoryModel.findOne({
      _id: new Types.ObjectId(categoryId),
      ownerTenantId: new Types.ObjectId(userId),
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Укажите название категории');
      const duplicate = await this.categoryModel.findOne({
        ownerTenantId: category.ownerTenantId,
        name,
        _id: { $ne: category._id },
      });
      if (duplicate) throw new BadRequestException('Категория с таким названием уже существует');
      category.name = name;
    }

    if (dto.permissions !== undefined) {
      const permissions = sanitizeTenantEmployeePermissions(dto.permissions);
      if (!permissions.length) {
        throw new BadRequestException('Выберите хотя бы одно право для категории');
      }
      category.permissions = permissions;
    }

    if (dto.isDefault === true) {
      await this.categoryModel.updateMany(
        { ownerTenantId: category.ownerTenantId, _id: { $ne: category._id } },
        { $set: { isDefault: false } },
      );
      category.isDefault = true;
    } else if (dto.isDefault === false && category.isDefault) {
      throw new BadRequestException('Нельзя снять флаг категории по умолчанию — назначьте другую');
    }

    await category.save();
    return { category: this.mapCategory(category) };
  }

  async deleteCategory(userId: string, categoryId: string) {
    await this.assertTenantOwner(userId);
    const category = await this.categoryModel.findOne({
      _id: new Types.ObjectId(categoryId),
      ownerTenantId: new Types.ObjectId(userId),
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    const assignedCount = await this.userModel.countDocuments({
      parentTenantId: category.ownerTenantId,
      employeeCategoryId: category._id,
      isActive: { $ne: false },
    });
    if (assignedCount > 0) {
      throw new BadRequestException('Нельзя удалить категорию: к ней привязаны сотрудники');
    }

    const wasDefault = category.isDefault;
    await category.deleteOne();

    if (wasDefault) {
      const fallback = await this.categoryModel
        .findOne({ ownerTenantId: new Types.ObjectId(userId) })
        .sort({ createdAt: 1 });
      if (fallback) {
        fallback.isDefault = true;
        await fallback.save();
      }
    }

    return { message: 'Категория удалена' };
  }

  async resolveCategoryForEmployee(ownerId: Types.ObjectId, categoryId?: string) {
    if (categoryId) {
      const category = await this.categoryModel.findOne({
        _id: new Types.ObjectId(categoryId),
        ownerTenantId: ownerId,
      });
      if (!category) throw new NotFoundException('Категория сотрудников не найдена');
      return category;
    }
    return this.ensureDefaultCategory(ownerId);
  }

  async getCategoryMap(ownerId: Types.ObjectId) {
    const categories = await this.categoryModel.find({ ownerTenantId: ownerId }).lean();
    return new Map(categories.map((category) => [category._id.toString(), category]));
  }

  async resolveUserPermissions(user: UserDocument | Record<string, any>): Promise<string[]> {
    if (user.parentTenantId && user.employeeCategoryId) {
      const category = await this.categoryModel.findById(user.employeeCategoryId).lean();
      if (category?.permissions?.length) {
        return sanitizeTenantEmployeePermissions(category.permissions);
      }
    }

    if (user.parentTenantId) {
      const fallback = await this.ensureDefaultCategory(user.parentTenantId);
      return sanitizeTenantEmployeePermissions(fallback.permissions);
    }

    return this.accessConfigService.getPermissionsForRole(user.role || 'tenant');
  }
}