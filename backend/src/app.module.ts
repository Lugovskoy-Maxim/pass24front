import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { PassesModule } from './passes/passes.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { AdminModule } from './admin/admin.module';
import { AccessConfigModule } from './access/access-config.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (env: Record<string, string>) => {
        if (!env.MONGODB_URI) {
          console.warn('⚠️  MONGODB_URI not set — using default or will fail at runtime');
        }
        if (!env.MONGODB_AUTH_URI) {
          console.log('ℹ️  MONGODB_AUTH_URI not set — using pass24_auth on the same MongoDB host');
        }
        return env;
      },
    }),
    DatabaseModule,
    AccessConfigModule,
    AuditModule,
    MailModule,
    SiteSettingsModule,
    AuthModule,
    PassesModule,
    AppConfigModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
