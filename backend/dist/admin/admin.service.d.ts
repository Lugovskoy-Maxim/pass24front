import { Model } from 'mongoose';
import { AuditActor, AuditQuery, AuditService } from '../audit/audit.service';
import { PassesService } from '../passes/passes.service';
import { OfficeDocument, PassDocument, PropertyDocument, UserDocument } from '../schemas';
import { CreateBusinessCenterDto } from './dto/create-business-center.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateBusinessCenterDto } from './dto/update-business-center.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
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
    private auditService;
    private passesService;
    constructor(userModel: Model<UserDocument>, propertyModel: Model<PropertyDocument>, officeModel: Model<OfficeDocument>, passModel: Model<PassDocument>, auditService: AuditService, passesService: PassesService);
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
        settings: {
            business_center_name: any;
            max_passes_per_day: any;
            auto_approve_delivery: any;
            working_hours_from: any;
            working_hours_to: any;
            contact_phone: any;
            contact_email: any;
            reception_floor: any;
        };
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
        };
    }>;
    updateUser(id: string, dto: Partial<CreateUserDto & {
        isActive: boolean;
    }>, actor?: AuditActor): Promise<{
        user: {
            id: any;
            email: any;
            fullName: any;
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
        };
    }>;
    getSettings(actor?: any): Promise<{
        business_center_name: any;
        max_passes_per_day: any;
        auto_approve_delivery: any;
        working_hours_from: any;
        working_hours_to: any;
        contact_phone: any;
        contact_email: any;
        reception_floor: any;
    }>;
    updateSettings(dto: UpdateSettingsDto, actor?: any): Promise<{
        settings: {
            business_center_name: any;
            max_passes_per_day: any;
            auto_approve_delivery: any;
            working_hours_from: any;
            working_hours_to: any;
            contact_phone: any;
            contact_email: any;
            reception_floor: any;
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
        }[];
    }>;
    createBusinessCenter(dto: CreateBusinessCenterDto, actor?: AuditActor): Promise<{
        businessCenter: {
            id: string;
            name: string;
            address: string;
            officesCount: number;
            isActive: boolean;
            createdAt: any;
        };
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
    seedTestData(): Promise<{
        businessCenters: number;
        offices: number;
        tenants: number;
        skipped: boolean;
        message: string;
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
    private getPrimaryProperty;
    private getActorPropertyIds;
    private ensureBcAccess;
    private mapPropertySettings;
    private countBy;
}
