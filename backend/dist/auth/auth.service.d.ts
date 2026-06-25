import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { AccessConfigService } from '../access/access-config.service';
import { OfficeDocument, PropertyDocument, UserDocument } from '../schemas';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthService {
    private userModel;
    private officeModel;
    private propertyModel;
    private jwtService;
    private accessConfigService;
    constructor(userModel: Model<UserDocument>, officeModel: Model<OfficeDocument>, propertyModel: Model<PropertyDocument>, jwtService: JwtService, accessConfigService: AccessConfigService);
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
    me(userId: string): Promise<{
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
    private createTestUser;
}
