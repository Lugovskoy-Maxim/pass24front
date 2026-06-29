import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessConfig, AccessConfigDocument } from '../schemas/access-config.schema';
import {
  ALL_PASS_TYPES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PASS_TYPE_LABELS,
  ROLE_LABELS,
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

    let changed = false;
    const validKeys = new Set<string>(ALL_PERMISSIONS.map((p) => p.key));

    for (const [role, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (!existing.rolePermissions[role]) {
        existing.rolePermissions[role] = [...defaults];
        changed = true;
      }
    }

    for (const [role, perms] of Object.entries(existing.rolePermissions)) {
      const sanitized = [...new Set((perms || []).filter((p) => validKeys.has(p)))];
      const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];

      for (const perm of defaults) {
        if (!sanitized.includes(perm)) {
          sanitized.push(perm);
          changed = true;
        }
      }

      if (role === 'admin' && !sanitized.includes('admin.permissions')) {
        sanitized.push('admin.permissions');
        changed = true;
      }

      if (sanitized.length !== perms.length || sanitized.some((p, i) => p !== perms[i])) {
        existing.rolePermissions[role] = sanitized;
        changed = true;
      }
    }

    if (changed) {
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
      const validKeys = new Set<string>(ALL_PERMISSIONS.map((p) => p.key));
      for (const [role, perms] of Object.entries(data.rolePermissions)) {
        doc.rolePermissions[role] = (perms || []).filter((p) => validKeys.has(p));
      }
      for (const [role, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const current = doc.rolePermissions[role] || [];
        if (current.includes('admin.panel')) {
          for (const perm of ['passes.view_all', 'passes.reception', 'passes.lookup', ...defaults]) {
            if (!current.includes(perm)) current.push(perm);
          }
          doc.rolePermissions[role] = current;
        }
      }
      if (!doc.rolePermissions.admin?.includes('admin.permissions')) {
        doc.rolePermissions.admin = [
          ...new Set([...(doc.rolePermissions.admin || []), 'admin.permissions']),
        ];
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

  async canViewAllPasses(role: string): Promise<boolean> {
    if (role === 'tenant') return false;
    if (await this.hasPermission(role, 'passes.view_all')) return true;
    return this.hasPermission(role, 'admin.panel');
  }

  private mapConfig(doc: any) {
    const mergedRoles = {
      ...DEFAULT_ROLE_PERMISSIONS,
      ...doc.rolePermissions,
    };

    return {
      enabledPassTypes: doc.enabledPassTypes,
      rolePermissions: doc.rolePermissions,
      permissions: ALL_PERMISSIONS,
      passTypeLabels: PASS_TYPE_LABELS,
      roleLabels: ROLE_LABELS,
      roles: Object.keys(mergedRoles),
    };
  }
}