import { AccessConfigService } from '../access/access-config.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class AuthController {
    private readonly authService;
    private readonly accessConfigService;
    constructor(authService: AuthService, accessConfigService: AccessConfigService);
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
            role_label: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            is_active: boolean;
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
    getDevAccounts(): {
        accounts: {
            label: string;
            email: string;
            password: string;
            role: string;
        }[];
    };
    requestRegistrationCode(dto: RegisterDto): Promise<{
        verificationRequired: boolean;
        verificationChannel: "phone" | "email";
        message: string;
        expiresInMinutes: number;
    }>;
    confirmRegistration(dto: ConfirmRegistrationDto): Promise<{
        pendingApproval: boolean;
        message: string;
    }>;
    register(dto: RegisterDto): Promise<{
        verificationRequired: boolean;
        verificationChannel: "phone" | "email";
        message: string;
        expiresInMinutes: number;
    }>;
    me(req: any): Promise<{
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
            role_label: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            is_active: boolean;
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
    requestProfileChange(req: any, dto: UpdateProfileDto): Promise<{
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
            role_label: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            is_active: boolean;
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
    cancelProfileChange(req: any): Promise<{
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
            role_label: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
            parent_tenant_id: any;
            is_tenant_owner: boolean;
            is_active: boolean;
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
    listTenantEmployees(req: any): Promise<{
        employees: {
            id: string;
            email: string | undefined;
            full_name: string | undefined;
            last_name: string | undefined;
            first_name: string | undefined;
            middle_name: string | undefined;
            phone: string | undefined;
            is_active: boolean;
            role: string;
            role_label: any;
            created_at: any;
        }[];
    }>;
    addTenantEmployee(req: any, dto: CreateTenantEmployeeDto): Promise<{
        employee: {
            id: string;
            email: string | undefined;
            full_name: string | undefined;
            last_name: string | undefined;
            first_name: string | undefined;
            middle_name: string | undefined;
            phone: string | undefined;
            is_active: boolean;
            role: string;
            role_label: any;
            created_at: any;
        };
    }>;
    removeTenantEmployee(req: any, id: string): Promise<{
        message: string;
    }>;
    listEmployeeRoles(): Promise<{
        roles: {
            key: string;
            label: any;
            permissions: any;
        }[];
    }>;
}
