import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<{
        user: {
            id: any;
            email: any;
            full_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
        };
        token: string;
    }>;
    register(dto: RegisterDto): Promise<{
        user: {
            id: any;
            email: any;
            full_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
        };
        token: string;
    }>;
    me(req: any): Promise<{
        user: {
            id: any;
            email: any;
            full_name: any;
            phone: any;
            company: any;
            role: any;
            office: any;
            floor: any;
            offices: any[];
            permissions: string[];
            enabledPassTypes: any;
        };
    }>;
}
