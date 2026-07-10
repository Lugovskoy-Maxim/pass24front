import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AccessConfigDocument } from '../schemas/access-config.schema';
export declare class AccessConfigService implements OnModuleInit {
    private accessConfigModel;
    constructor(accessConfigModel: Model<AccessConfigDocument>);
    onModuleInit(): Promise<void>;
    ensureDefaults(): Promise<void>;
    getConfig(): Promise<{
        enabledPassTypes: any;
        rolePermissions: any;
        permissions: readonly [{
            readonly key: "passes.create";
            readonly label: "Заказ пропусков";
            readonly group: "Пропуска";
        }, {
            readonly key: "passes.templates";
            readonly label: "Шаблоны пропусков";
            readonly group: "Пропуска";
        }, {
            readonly key: "passes.view_own";
            readonly label: "Просмотр своих пропусков";
            readonly group: "Пропуска";
        }, {
            readonly key: "passes.view_all";
            readonly label: "Просмотр всех пропусков";
            readonly group: "Пропуска";
        }, {
            readonly key: "passes.approve";
            readonly label: "Одобрение и отклонение";
            readonly group: "Пропуска";
        }, {
            readonly key: "passes.reception";
            readonly label: "Вход / выход посетителей";
            readonly group: "Ресепшн";
        }, {
            readonly key: "passes.lookup";
            readonly label: "Поиск пропуска по номеру";
            readonly group: "Ресепшн";
        }, {
            readonly key: "admin.panel";
            readonly label: "Панель администратора";
            readonly group: "Администрирование";
        }, {
            readonly key: "admin.users";
            readonly label: "Управление пользователями";
            readonly group: "Администрирование";
        }, {
            readonly key: "admin.offices";
            readonly label: "Управление офисами";
            readonly group: "Администрирование";
        }, {
            readonly key: "admin.settings";
            readonly label: "Базовые настройки сайта";
            readonly group: "Администрирование";
        }, {
            readonly key: "admin.permissions";
            readonly label: "Права и типы пропусков";
            readonly group: "Администрирование";
        }];
        passTypeLabels: Record<string, string>;
        roleLabels: any;
        roles: string[];
        systemRoles: ("tenant" | "security" | "admin" | "bc_admin")[];
    }>;
    updateConfig(data: {
        enabledPassTypes?: string[];
        rolePermissions?: Record<string, string[]>;
        roleLabels?: Record<string, string>;
    }): Promise<{
        config: {
            enabledPassTypes: any;
            rolePermissions: any;
            permissions: readonly [{
                readonly key: "passes.create";
                readonly label: "Заказ пропусков";
                readonly group: "Пропуска";
            }, {
                readonly key: "passes.templates";
                readonly label: "Шаблоны пропусков";
                readonly group: "Пропуска";
            }, {
                readonly key: "passes.view_own";
                readonly label: "Просмотр своих пропусков";
                readonly group: "Пропуска";
            }, {
                readonly key: "passes.view_all";
                readonly label: "Просмотр всех пропусков";
                readonly group: "Пропуска";
            }, {
                readonly key: "passes.approve";
                readonly label: "Одобрение и отклонение";
                readonly group: "Пропуска";
            }, {
                readonly key: "passes.reception";
                readonly label: "Вход / выход посетителей";
                readonly group: "Ресепшн";
            }, {
                readonly key: "passes.lookup";
                readonly label: "Поиск пропуска по номеру";
                readonly group: "Ресепшн";
            }, {
                readonly key: "admin.panel";
                readonly label: "Панель администратора";
                readonly group: "Администрирование";
            }, {
                readonly key: "admin.users";
                readonly label: "Управление пользователями";
                readonly group: "Администрирование";
            }, {
                readonly key: "admin.offices";
                readonly label: "Управление офисами";
                readonly group: "Администрирование";
            }, {
                readonly key: "admin.settings";
                readonly label: "Базовые настройки сайта";
                readonly group: "Администрирование";
            }, {
                readonly key: "admin.permissions";
                readonly label: "Права и типы пропусков";
                readonly group: "Администрирование";
            }];
            passTypeLabels: Record<string, string>;
            roleLabels: any;
            roles: string[];
            systemRoles: ("tenant" | "security" | "admin" | "bc_admin")[];
        };
    }>;
    getPermissionsForRole(role: string): Promise<string[]>;
    getEmployeeAssignableRoles(): Promise<{
        roles: {
            key: string;
            label: any;
            permissions: any;
        }[];
    }>;
    assertEmployeeRole(role: string): Promise<void>;
    isPassTypeEnabled(passType: string): Promise<boolean>;
    hasPermission(role: string, permission: string): Promise<boolean>;
    canViewAllPasses(role: string, parentTenantId?: string): Promise<boolean>;
    private mapConfig;
}
