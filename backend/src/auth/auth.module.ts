import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsGuard } from './permissions.guard';
import { AuthDatabaseModule } from '../database/auth-database.module';
import {
  Office,
  OfficeSchema,
  Property,
  PropertySchema,
  RegistrationPending,
  RegistrationPendingSchema,
  TenantEmployeePosition,
  TenantEmployeePositionSchema,
  User,
  UserSchema,
} from '../schemas';
import { TenantEmployeePositionService } from './tenant-employee-position.service';

@Module({
  imports: [
    AuthDatabaseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RegistrationPending.name, schema: RegistrationPendingSchema },
      { name: TenantEmployeePosition.name, schema: TenantEmployeePositionSchema },
    ]),
    MongooseModule.forFeature([
      { name: Office.name, schema: OfficeSchema },
      { name: Property.name, schema: PropertySchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '7d') as any },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TenantEmployeePositionService, JwtStrategy, PermissionsGuard],
  exports: [AuthService, TenantEmployeePositionService, JwtModule, PermissionsGuard],
})
export class AuthModule {}