import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<{
        user: {
            id: any;
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
    register(dto: RegisterDto): Promise<{
        pendingApproval: boolean;
        message: string;
    }>;
    me(req: any): Promise<{
        user: {
            id: any;
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
}
