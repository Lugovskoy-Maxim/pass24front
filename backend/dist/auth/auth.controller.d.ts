import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import { CreateTenantEmployeeDto } from './dto/create-tenant-employee.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TenantEmployeePositionService } from './tenant-employee-position.service';
export declare class AuthController {
    private readonly authService;
    private readonly positionService;
    constructor(authService: AuthService, positionService: TenantEmployeePositionService);
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
            position_id: any;
            position_name: string | undefined;
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
            position_id: string;
            position_name: string;
            created_at: any;
        };
    }>;
    removeTenantEmployee(req: any, id: string): Promise<{
        message: string;
    }>;
    listEmployeePositions(req: any): Promise<{
        positions: {
            id: any;
            name: any;
            permissions: any;
            is_default: boolean;
            created_at: any;
            updated_at: any;
        }[];
        assignablePermissions: ({
            readonly key: "passes.create";
            readonly label: "Заказ пропусков";
            readonly group: "Пропуска";
        } | {
            readonly key: "passes.templates";
            readonly label: "Шаблоны пропусков";
            readonly group: "Пропуска";
        } | {
            readonly key: "passes.view_own";
            readonly label: "Просмотр своих пропусков";
            readonly group: "Пропуска";
        } | {
            readonly key: "passes.view_all";
            readonly label: "Просмотр всех пропусков";
            readonly group: "Пропуска";
        } | {
            readonly key: "passes.approve";
            readonly label: "Одобрение и отклонение";
            readonly group: "Пропуска";
        } | {
            readonly key: "passes.reception";
            readonly label: "Вход / выход посетителей";
            readonly group: "Ресепшн";
        } | {
            readonly key: "passes.lookup";
            readonly label: "Поиск пропуска по номеру";
            readonly group: "Ресепшн";
        } | {
            readonly key: "admin.panel";
            readonly label: "Панель администратора";
            readonly group: "Администрирование";
        } | {
            readonly key: "admin.users";
            readonly label: "Управление пользователями";
            readonly group: "Администрирование";
        } | {
            readonly key: "admin.offices";
            readonly label: "Управление офисами";
            readonly group: "Администрирование";
        } | {
            readonly key: "admin.settings";
            readonly label: "Базовые настройки сайта";
            readonly group: "Администрирование";
        } | {
            readonly key: "admin.permissions";
            readonly label: "Права и типы пропусков";
            readonly group: "Администрирование";
        })[];
    }>;
}
