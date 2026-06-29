import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { AuditService } from '../audit/audit.service';
import { OfficeDocument, PropertyDocument, UserDocument } from '../schemas';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class AuthService {
    private userModel;
    private officeModel;
    private propertyModel;
    private jwtService;
    private accessConfigService;
    private auditService;
    constructor(userModel: Model<UserDocument>, officeModel: Model<OfficeDocument>, propertyModel: Model<PropertyDocument>, jwtService: JwtService, accessConfigService: AccessConfigService, auditService: AuditService);
    register(dto: RegisterDto): Promise<{
        pendingApproval: boolean;
        message: string;
    }>;
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
    me(userId: string): Promise<{
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
    requestProfileChange(userId: string, dto: UpdateProfileDto): Promise<{
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
    cancelProfileChange(userId: string): Promise<{
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
    getUserOffices(userId: string): Promise<{
        id: string;
        propertyId: string;
        businessCenterName: string | undefined;
        number: string;
        floor: string;
        company: string | undefined;
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
