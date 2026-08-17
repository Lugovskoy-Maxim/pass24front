import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSettings, AppSettingsSchema } from '../schemas/app-settings.schema';
import { Office, OfficeSchema } from '../schemas/office.schema';
import { Pass, PassSchema } from '../schemas/pass.schema';
import { PassTemplate, PassTemplateSchema } from '../schemas/pass-template.schema';
import { Property, PropertySchema } from '../schemas/property.schema';
import { SiteSourceService } from './site-source.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppSettings.name, schema: AppSettingsSchema },
      { name: Office.name, schema: OfficeSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Pass.name, schema: PassSchema },
      { name: PassTemplate.name, schema: PassTemplateSchema },
    ]),
  ],
  providers: [SiteSourceService],
  exports: [SiteSourceService],
})
export class SiteSourceModule {}
