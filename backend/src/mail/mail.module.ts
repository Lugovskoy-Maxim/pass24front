import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Global()
@Module({
  imports: [SiteSettingsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
