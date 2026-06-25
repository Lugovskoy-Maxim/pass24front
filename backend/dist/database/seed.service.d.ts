import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { UserDocument } from '../schemas';
export declare class SeedService implements OnModuleInit {
    private userModel;
    private configService;
    private readonly logger;
    constructor(userModel: Model<UserDocument>, configService: ConfigService);
    onModuleInit(): Promise<void>;
    private seedAdminUser;
}
