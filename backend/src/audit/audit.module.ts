import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthDatabaseModule } from '../database/auth-database.module';
import { AuditLog, AuditLogSchema, User, UserSchema } from '../schemas';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}