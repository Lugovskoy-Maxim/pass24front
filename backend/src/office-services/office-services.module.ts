import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthDatabaseModule } from '../database/auth-database.module';
import { Office, OfficeSchema, User, UserSchema } from '../schemas';
import { OfficeServicesService } from './office-services.service';
import { OfficeServicesController } from './office-services.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Office.name, schema: OfficeSchema }]),
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [OfficeServicesService],
  controllers: [OfficeServicesController],
  exports: [OfficeServicesService],
})
export class OfficeServicesModule {}
