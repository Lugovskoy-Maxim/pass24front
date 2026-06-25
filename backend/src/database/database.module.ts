import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import {
  AccessEvent,
  AccessEventSchema,
  Authorization,
  AuthorizationSchema,
  Office,
  OfficeSchema,
  Pass,
  PassTemplate,
  PassRequest,
  PassRequestSchema,
  PassSchema,
  PassTemplateSchema,
  Property,
  PropertySchema,
  User,
  UserSchema,
  Vehicle,
  VehicleSchema,
} from '../schemas';
import { SeedService } from './seed.service';

const ALL_FEATURES = [
  { name: Property.name, schema: PropertySchema },
  { name: Office.name, schema: OfficeSchema },
  { name: User.name, schema: UserSchema },
  { name: Vehicle.name, schema: VehicleSchema },
  { name: Pass.name, schema: PassSchema },
  { name: PassTemplate.name, schema: PassTemplateSchema },
  { name: PassRequest.name, schema: PassRequestSchema },
  { name: AccessEvent.name, schema: AccessEventSchema },
  { name: Authorization.name, schema: AuthorizationSchema },
];

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/pass24';
        console.log(`🔌 Connecting to MongoDB at: ${uri.replace(/:[^:]*@/, ':****@')}`);
        return {
          uri,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [SeedService],
  exports: [MongooseModule],
})
export class DatabaseModule {
  /**
   * Используй в feature-модулях:
   * imports: [DatabaseModule.forFeature()]
   */
  static forFeature(): DynamicModule {
    return MongooseModule.forFeature(ALL_FEATURES);
  }

  /**
   * Если хочешь зарегистрировать только часть моделей
   */
  static forFeatureOnly(models: { name: string; schema: any }[]): DynamicModule {
    return MongooseModule.forFeature(models);
  }
}
