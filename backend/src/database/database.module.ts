import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import {
  AppSettings,
  AppSettingsSchema,
  AuditLog,
  AuditLogSchema,
  Office,
  OfficeSchema,
  Pass,
  PassTemplate,
  PassSchema,
  PassTemplateSchema,
  Property,
  PropertySchema,
  User,
  UserSchema,
} from '../schemas';
import { AuthDatabaseModule } from './auth-database.module';
import { SeedService } from './seed.service';
import { TestDataSeedService } from './test-data-seed.service';

// pass24 (без users — они в auth)
const APP_FEATURES = [
  { name: Property.name, schema: PropertySchema },
  { name: Office.name, schema: OfficeSchema },
  { name: Pass.name, schema: PassSchema },
  { name: PassTemplate.name, schema: PassTemplateSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: AppSettings.name, schema: AppSettingsSchema },
];

@Module({
  imports: [
    AuthDatabaseModule,
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/pass24';
        console.log(
          `🔌 Connecting to MongoDB at: ${uri.replace(/:[^:]*@/, ':****@')}`,
        );
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: Office.name, schema: OfficeSchema },
    ]),
  ],
  providers: [SeedService, TestDataSeedService],
  exports: [MongooseModule, AuthDatabaseModule, TestDataSeedService],
})
export class DatabaseModule {
  static forFeature(): DynamicModule {
    return MongooseModule.forFeature(APP_FEATURES);
  }

  static forFeatureOnly(
    models: { name: string; schema: any }[],
  ): DynamicModule {
    return MongooseModule.forFeature(models);
  }
}
