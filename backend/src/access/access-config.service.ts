import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessConfig, AccessConfigDocument } from '../schemas/access-config.schema';
import {
  ALL_PASS_TYPES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PASS_TYPE_LABELS,
} from './access.constants';

@Injectable()
export class AccessConfigService implements OnModuleInit {
  constructor(
    @InjectModel(AccessConfig.name) private accessConfigModel: Model<AccessConfigDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    const existing = await this.accessConfigModel.findOne({ key: 'default' });
    if (!existing) {
      await this.accessConfigModel.create({
        key: 'default',
        enabledPassTypes: [...ALL_PASS_TYPES],
        rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS },
      });
      return;
    }

    const tenantPerms: string[] = existing.rolePermissions?.tenant || [];
    if (tenantPerms.includes('passes.view_own') && !tenantPerms.includes('passes.templates')) {
      existing.rolePermissions.tenant = [
        ...tenantPerms.filter((p) => p !== 'passes.view_own'),
        'passes.templates',
      ];
      existing.markModified('rolePermissions');
      await existing.save();
    }
  }

  async getConfig() {
    await this.ensureDefaults();
    const doc = await this.accessConfigModel.findOne({ key: 'default' }).lean();
    return this.mapConfig(doc!);
  }

  async updateConfig(data: {
    enabledPassTypes?: string[];
    rolePermissions?: Record<string, string[]>;
  }) {
    await this.ensureDefaults();
    const doc = await this.accessConfigModel.findOne({ key: 'default' });
    if (!doc) throw new BadRequestException('Конфигурация не найдена');

    if (data.enabledPassTypes) {
      const invalid = data.enabledPassTypes.filter((t) => !ALL_PASS_TYPES.includes(t as any));
      if (invalid.length) {
        throw new BadRequestException(`Неизвестные типы пропусков: ${invalid.join(', ')}`);
      }
      if (data.enabledPassTypes.length === 0) {
        throw new BadRequestException('Должен быть включён хотя бы один тип пропуска');
      }
      doc.enabledPassTypes = data.enabledPassTypes;
    }

    if (data.rolePermissions) {
      const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key));
      for (const [role, perms] of Object.entries(data.rolePermissions)) {
        const invalid = perms.filter((p) => !validKeys.has(p as any));
        if (invalid.length) {
          throw new BadRequestException(`Неизвестные права для роли ${role}: ${invalid.join(', ')}`);
        }
        doc.rolePermissions[role] = perms;
      }
      doc.markModified('rolePermissions');
    }

    await doc.save();
    return { config: this.mapConfig(doc.toObject()) };
  }

  async getPermissionsForRole(role: string): Promise<string[]> {
    const { rolePermissions } = await this.getConfig();
    return rolePermissions[role] || [];
  }

  async isPassTypeEnabled(passType: string): Promise<boolean> {
    const { enabledPassTypes } = await this.getConfig();
    return enabledPassTypes.includes(passType);
  }

  async hasPermission(role: string, permission: string): Promise<boolean> {
    const perms = await this.getPermissionsForRole(role);
    return perms.includes(permission);
  }

  private mapConfig(doc: any) {
    return {
      enabledPassTypes: doc.enabledPassTypes,
      rolePermissions: doc.rolePermissions,
      permissions: ALL_PERMISSIONS,
      passTypeLabels: PASS_TYPE_LABELS,
      roles: Object.keys(doc.rolePermissions),
    };
  }
}