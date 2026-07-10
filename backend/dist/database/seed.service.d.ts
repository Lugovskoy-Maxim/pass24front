import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Model } from 'mongoose';
import { UserDocument } from '../schemas';
import { TestDataSeedService } from './test-data-seed.service';
export declare class SeedService implements OnModuleInit {
    private userModel;
    private mainConnection;
    private configService;
    private testDataSeedService;
    private readonly logger;
    constructor(userModel: Model<UserDocument>, mainConnection: Connection, configService: ConfigService, testDataSeedService: TestDataSeedService);
    onModuleInit(): Promise<void>;
    private migrateUsersFromMainDbIfNeeded;
    private seedAdminUser;
    private seedDevTestData;
}
