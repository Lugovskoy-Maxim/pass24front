import { Model } from 'mongoose';
import { AuditActor, AuditQuery, AuditService } from '../audit/audit.service';
import { PassesService } from '../passes/passes.service';
import { OfficeDocument, PassDocument, PassTemplateDocument, PropertyDocument, UserDocument } from '../schemas';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';
import { TestDataSeedService } from '../database/test-data-seed.service';
export interface UserQuery {
    category?: 'tenants' | 'staff';
    role?: string;
    search?: string;
    isActive?: string;
    propertyId?: string;
    officeId?: string;
}
export declare class AdminService {
    private userModel;
    private propertyModel;
    private officeModel;
    private passModel;
    private passTemplateModel;
    private auditService;
    private passesService;
    private testDataSeedService;
    constructor(userModel: Model<UserDocument>, propertyModel: Model<PropertyDocument>, officeModel: Model<OfficeDocument>, passModel: Model<PassDocument>, passTemplateModel: Model<PassTemplateDocument>, auditService: AuditService, passesService: PassesService, testDataSeedService: TestDataSeedService);
    assertRolesDeletable(roles: string[]): Promise<void>;
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
    getAudit(query?: AuditQuery): Promise<{
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
    exportAuditCsv(query?: AuditQuery): Promise<string>;
    getUsers(params?: UserQuery): Promise<{
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
    private buildUserFilter;
    createUser(dto: CreateUserDto, actor?: AuditActor): Promise<{
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
    approveRegistration(id: string, actor?: AuditActor): Promise<{
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
    rejectRegistration(id: string, actor?: AuditActor): Promise<{
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
    approveProfileChange(id: string, actor?: AuditActor): Promise<{
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
    rejectProfileChange(id: string, actor?: AuditActor): Promise<{
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
    }>, actor?: AuditActor): Promise<{
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
    updateBusinessCenter(id: string, dto: UpdateBusinessCenterDto, actor?: AuditActor): Promise<{
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
    getBusinessCenters(actor?: any): Promise<{
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
    deleteBusinessCenter(id: string, actor?: AuditActor): Promise<{
        message: string;
        id: string;
    }>;
    createBusinessCenter(dto: CreateBusinessCenterDto, actor?: AuditActor): Promise<{
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
    exportOfficesCsv(): Promise<string>;
    importOfficesCsv(csv: string, actor?: AuditActor): Promise<{
        created: number;
        skipped: number;
        errors: string[];
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
    createOffice(dto: CreateOfficeDto, actor?: AuditActor): Promise<{
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
    }>, actor?: AuditActor): Promise<{
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
    deleteOffice(id: string, actor?: AuditActor): Promise<{
        message: string;
        id: string;
    }>;
    seedTestData(): Promise<{
        tenants: number;
        message: string;
        businessCenters: number;
        offices: number;
        users: number;
        skipped: boolean;
    }>;
    getTenantOffices(tenantId: string): Promise<{
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
    }[]>;
    private assignOfficesToTenant;
    private syncTenantProperties;
    private mapOffice;
    private getUserBusinessCenters;
    private mapUser;
    private getActorPropertyIds;
    private ensureBcAccess;
    private mapBcPassSettings;
    private mergeBcPassSettings;
    private countBy;
}
