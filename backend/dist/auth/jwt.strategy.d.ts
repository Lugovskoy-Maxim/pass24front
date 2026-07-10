import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { UserDocument } from '../schemas';
import { TenantEmployeePositionService } from './tenant-employee-position.service';
declare const JwtStrategy_base: new (...args: any) => any;
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    private userModel;
    private positionService;
    constructor(configService: ConfigService, userModel: Model<UserDocument>, positionService: TenantEmployeePositionService);
    validate(payload: any): Promise<{
        userId: any;
        email: any;
        role: any;
        fullName: string | undefined;
        parentTenantId: string | undefined;
        permissions: string[];
    }>;
}
export {};
