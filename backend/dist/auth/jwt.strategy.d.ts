import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { AccessConfigService } from '../access/access-config.service';
import { UserDocument } from '../schemas';
declare const JwtStrategy_base: new (...args: any) => any;
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    private userModel;
    private accessConfigService;
    constructor(configService: ConfigService, userModel: Model<UserDocument>, accessConfigService: AccessConfigService);
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
