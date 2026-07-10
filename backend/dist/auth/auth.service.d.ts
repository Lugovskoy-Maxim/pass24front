import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { OfficeDocument, PropertyDocument, RegistrationPendingDocument, UserDocument } from '../schemas';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TenantEmployeePositionService } from './tenant-employee-position.service';
export declare class AuthService {
    private userModel;
    private pendingModel;
    private officeModel;
    private propertyModel;
    private jwtService;
    private accessConfigService;
    private auditService;
    private mailService;
    private positionService;
    constructor(userModel: Model<UserDocument>, pendingModel: Model<RegistrationPendingDocument>, officeModel: Model<OfficeDocument>, propertyModel: Model<PropertyDocument>, jwtService: JwtService, accessConfigService: AccessConfigService, auditService: AuditService, mailService: MailService, positionService: TenantEmployeePositionService);
    requestRegistrationCode(dto: RegisterDto): Promise<{
        verificationRequired: boolean;
        message: string;
        expiresInMinutes: number;
    }>;
    confirmRegistration(dto: ConfirmRegistrationDto): Promise<{
        pendingApproval: boolean;
        message: string;
    }>;
    register(dto: RegisterDto): Promise<{
        verificationRequired: boolean;
        message: string;
        expiresInMinutes: number;
    }>;
    login(dto: LoginDto): Promise<{
        user: {
            id: any;
            username: any;
            email: any;
            full_name: any;
            last_name: any;
            first_name: any;
            middle_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            profile_change_request: {
                last_name: string;
                first_name: string;
                middle_name: string;
                full_name: string;
                phone: string | undefined;
                company: string | undefined;
                requested_at: string;
            } | null;
        };
        token: string;
    }>;
    me(userId: string): Promise<{
        user: {
            id: any;
            username: any;
            email: any;
            full_name: any;
            last_name: any;
            first_name: any;
            middle_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            profile_change_request: {
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
    requestProfileChange(userId: string, dto: UpdateProfileDto): Promise<{
        user: {
            id: any;
            username: any;
            email: any;
            full_name: any;
            last_name: any;
            first_name: any;
            middle_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            profile_change_request: {
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
    cancelProfileChange(userId: string): Promise<{
        user: {
            id: any;
            username: any;
            email: any;
            full_name: any;
            last_name: any;
            first_name: any;
            middle_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            profile_change_request: {
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
    listTenantEmployees(userId: string): Promise<{
        employees: {
            id: string;
            email: string | undefined;
            full_name: string | undefined;
            last_name: string | undefined;
            first_name: string | undefined;
            middle_name: string | undefined;
            phone: string | undefined;
            is_active: boolean;
            position_id: any;
            position_name: string | undefined;
            created_at: any;
        }[];
    }>;
    addTenantEmployee(userId: string, dto: CreateTenantEmployeeDto): Promise<{
        employee: {
            id: string;
            email: string | undefined;
            full_name: string | undefined;
            last_name: string | undefined;
            first_name: string | undefined;
            middle_name: string | undefined;
            phone: string | undefined;
            is_active: boolean;
            position_id: string;
            position_name: string;
            created_at: any;
        };
    }>;
    removeTenantEmployee(userId: string, employeeId: string): Promise<{
        message: string;
    }>;
    getUserOffices(userId: string, parentTenantId?: string): Promise<{
        id: string;
        propertyId: string;
        businessCenterName: string | undefined;
        number: string;
        floor: string | undefined;
        company: string | undefined;
        workingHoursFrom: any;
        workingHoursTo: any;
        closedWeekdays: number[];
    }[]>;
    private generateToken;
    private toUserDto;
    getDevAccounts(): {
        accounts: Array<{
            label: string;
            email: string;
            password: string;
            role: string;
        }>;
    };
    private createTestUser;
}
