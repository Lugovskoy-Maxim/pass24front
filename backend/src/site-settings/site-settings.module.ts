import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSettings, AppSettingsSchema } from '../schemas/app-settings.schema';
import { SiteSettingsService } from './site-settings.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AppSettings.name, schema: AppSettingsSchema }]),
  ],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}