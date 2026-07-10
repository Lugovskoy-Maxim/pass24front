import type { Response } from 'express';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { ImportOfficesDto } from './dto/import-offices.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAccessConfigDto } from './dto/update-access-config.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { SiteSettingsService } from '../site-settings/site-settings.service';
export declare class AdminController {
    private readonly adminService;
    private readonly accessConfigService;
    private readonly auditService;
    private readonly siteSettingsService;
    constructor(adminService: AdminService, accessConfigService: AccessConfigService, auditService: AuditService, siteSettingsService: SiteSettingsService);
    dashboard(): Promise<{
        stats: {
            users: {
                total: number;
                byRole: any;
            };
            passes: {
                total: number;
                today: number;
                week: number;
                byStatus: any;
            };
            businessCenters: number;
        };
        recentActivity: {
            id: any;
            userId: any;
            userName: any;
            userEmail: any;
            action: any;
            entityType: any;
            entityId: any;
            entityLabel: string;
            details: any;
            createdAt: any;
        }[];
        businessCenterNames: string[];
        officesCount: number;
    }>;
    seedTestData(): Promise<{
        tenants: number;
        message: string;
        businessCenters: number;
        offices: number;
        users: number;
        skipped: boolean;
    }>;
    getAccessConfig(): Promise<{
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
    updateAccessConfig(dto: UpdateAccessConfigDto, req: any): Promise<{
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
    getUsers(q: Record<string, string>): Promise<{
        users: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        }[];
        total: number;
        counts: {
            tenants: number;
            staff: number;
        };
    }>;
    createUser(dto: CreateUserDto, req: any): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
    }>;
    updateUser(id: string, dto: Partial<CreateUserDto & {
        isActive: boolean;
    }>, req: any): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
    }>;
    getRegistrationRequests(): Promise<{
        requests: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        }[];
    }>;
    approveRegistration(id: string, req: any): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
    }>;
    rejectRegistration(id: string, req: any): Promise<{
        message: string;
    }>;
    getProfileChangeRequests(): Promise<{
        requests: {
            user: {
                id: any;
                email: any;
                fullName: any;
                lastName: any;
                firstName: any;
                middleName: any;
                phone: any;
                company: any;
                role: any;
                office: any;
                floor: any;
                isActive: boolean;
                createdAt: any;
                passesCount: number;
                offices: any[];
                businessCenters: {
                    id: string;
                    name: string;
                }[];
                propertyIds: string[];
                profileChangeRequest: {
                    last_name: string;
                    first_name: string;
                    middle_name: string;
                    full_name: string;
                    phone: string | undefined;
                    company: string | undefined;
                    requested_at: string;
                } | null;
            };
            request: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        }[];
    }>;
    approveProfileChange(id: string, req: any): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
    }>;
    rejectProfileChange(id: string, req: any): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
            lastName: any;
            firstName: any;
            middleName: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            isActive: boolean;
            createdAt: any;
            passesCount: number;
            offices: any[];
            businessCenters: {
                id: string;
                name: string;
            }[];
            propertyIds: string[];
            profileChangeRequest: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
    }>;
    getBusinessCenters(req: any): Promise<{
        businessCenters: {
            id: string;
            name: string;
            address: string;
            officesCount: any;
            totalAreaSqm: any;
            isActive: boolean;
            createdAt: any;
            passSettings: {
                auto_approve_delivery: any;
                working_hours_from: any;
                working_hours_to: any;
                contact_phone: any;
                contact_email: any;
                reception_floor: any;
                require_checkout: string;
                closed_weekdays: any;
            };
        }[];
    }>;
    updateBusinessCenter(id: string, dto: UpdateBusinessCenterDto, req: any): Promise<{
        businessCenter: {
            id: string;
            name: string;
            address: string;
            officesCount: any;
            totalAreaSqm: any;
            isActive: boolean;
            createdAt: any;
            passSettings: {
                auto_approve_delivery: any;
                working_hours_from: any;
                working_hours_to: any;
                contact_phone: any;
                contact_email: any;
                reception_floor: any;
                require_checkout: string;
                closed_weekdays: any;
            };
        };
    }>;
    createBusinessCenter(dto: CreateBusinessCenterDto, req: any): Promise<{
        businessCenter: {
            id: string;
            name: string;
            address: string;
            officesCount: number;
            isActive: boolean;
            createdAt: any;
            passSettings: {
                auto_approve_delivery: any;
                working_hours_from: any;
                working_hours_to: any;
                contact_phone: any;
                contact_email: any;
                reception_floor: any;
                require_checkout: string;
                closed_weekdays: any;
            };
        };
    }>;
    deleteBusinessCenter(id: string, req: any): Promise<{
        message: string;
        id: string;
    }>;
    getOffices(): Promise<{
        offices: {
            id: any;
            propertyId: any;
            businessCenterName: any;
            number: any;
            floor: any;
            areaSqm: any;
            company: any;
            tenantId: any;
            tenantName: any;
            isActive: any;
            createdAt: any;
        }[];
    }>;
    exportOffices(res: Response): Promise<void>;
    importOffices(dto: ImportOfficesDto, req: any): Promise<{
        created: number;
        skipped: number;
        errors: string[];
    }>;
    createOffice(dto: CreateOfficeDto, req: any): Promise<{
        office: {
            id: any;
            propertyId: any;
            businessCenterName: any;
            number: any;
            floor: any;
            areaSqm: any;
            company: any;
            tenantId: any;
            tenantName: any;
            isActive: any;
            createdAt: any;
        };
    }>;
    updateOffice(id: string, dto: Partial<CreateOfficeDto & {
        isActive: boolean;
    }>, req: any): Promise<{
        office: {
            id: any;
            propertyId: any;
            businessCenterName: any;
            number: any;
            floor: any;
            areaSqm: any;
            company: any;
            tenantId: any;
            tenantName: any;
            isActive: any;
            createdAt: any;
        };
    }>;
    deleteOffice(id: string, req: any): Promise<{
        message: string;
        id: string;
    }>;
    exportAudit(query: Record<string, string>, res: Response): Promise<void>;
    getAudit(query: Record<string, string>): Promise<{
        entries: {
            id: any;
            userId: any;
            userName: any;
            userEmail: any;
            action: any;
            entityType: any;
            entityId: any;
            entityLabel: string;
            details: any;
            createdAt: any;
        }[];
        total: number;
        offset: number;
        limit: number;
    }>;
    private parseAuditQuery;
    getSiteSettings(): Promise<{
        settings: import("../site-settings/site-settings.service").SiteSettingsDto;
    }>;
    updateSiteSettings(dto: UpdateSiteSettingsDto, req: any): Promise<{
        settings: import("../site-settings/site-settings.service").SiteSettingsDto;
    }>;
    getDailyReport(date?: string): {
        date: string;
        summary: never[];
        visitors: never[];
    };
}
