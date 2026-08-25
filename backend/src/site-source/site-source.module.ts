import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AppSettings, AppSettingsSchema } from '../schemas/app-settings.schema';
import { Office, OfficeSchema } from '../schemas/office.schema';
import { Pass, PassSchema } from '../schemas/pass.schema';
import {
  PassTemplate,
  PassTemplateSchema,
} from '../schemas/pass-template.schema';
import { Property, PropertySchema } from '../schemas/property.schema';
import { SiteSourceService } from './site-source.service';
import { ServiceRequestsController } from './service-requests.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AppSettings.name, schema: AppSettingsSchema },
      { name: Office.name, schema: OfficeSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Pass.name, schema: PassSchema },
      { name: PassTemplate.name, schema: PassTemplateSchema },
    ]),
  ],
  providers: [SiteSourceService],
  controllers: [ServiceRequestsController],
  exports: [SiteSourceService],
})
export class SiteSourceModule {}
