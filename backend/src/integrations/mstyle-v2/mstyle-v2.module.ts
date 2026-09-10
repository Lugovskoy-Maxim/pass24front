import { MstyleConsentService } from './mstyle-v2.consent.service';
import { MstyleNativeConsoleProof } from './mstyle-v2.native-console';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMstyleSmsService, MSTYLE_SMS_SERVICE } from './mstyle-v2.sms';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthDatabaseModule } from '../../database/auth-database.module';
import { User, UserSchema } from '../../schemas';
import { SmsModule } from '../../sms/sms.module';
import { MstyleAuthService } from './mstyle-v2.auth.service';
import { MstyleV2Config } from './mstyle-v2.config';
import { MstyleDirectoryService } from './mstyle-v2.directory.service';
import { MstyleEventsService } from './mstyle-v2.events';
import { MstyleGuestsService } from './mstyle-v2.guests.service';
import {
  MstyleEnabledGuard,
  MstyleRequestGuard,
  MstyleRouteContextGuard,
  MstyleServiceTokenGuard,
} from './mstyle-v2.http';
import { MstyleIdempotencyService } from './mstyle-v2.idempotency';
import { MstyleIdentityService } from './mstyle-v2.identities';
import { MstyleOauthController } from './mstyle-v2.oauth.controller';
import { MstyleOauthService } from './mstyle-v2.oauth.service';
import { MstyleMockResponseInterceptor } from './mstyle-v2.mock.interceptor';
import { MstylePrivateController } from './mstyle-v2.private.controller';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import { MstyleRateLimitService } from './mstyle-v2.rate-limit';
import { MSTYLE_MODELS } from './mstyle-v2.schemas';
import { MstylePublicResponseService } from './mstyle-v2.public-response';
import { MstyleContactSelectionService } from './mstyle-v2.contact-selection';
import { MstyleReadinessService } from './mstyle-v2.readiness';
import { MstyleContactProofService } from './mstyle-v2.contact-proof';

@Module({
  imports: [
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature(MSTYLE_MODELS),
    SmsModule,
  ],
  exports: [MstyleIdentityService, MstyleOauthService, MstyleV2Config],
  controllers: [MstyleOauthController, MstylePrivateController],
  providers: [
    MstyleConsentService,
    MstyleNativeConsoleProof,
    {
      provide: MSTYLE_SMS_SERVICE,
      inject: [ConfigService],
      useFactory: createMstyleSmsService,
    },
    MstyleV2Config,
    MstylePublicResponseService,
    MstyleContactSelectionService,
    MstyleReadinessService,
    MstyleContactProofService,
    MstyleOauthService,
    MstyleAuthService,
    MstyleIdentityService,
    MstyleDirectoryService,
    MstylePrivateDataService,
    MstyleGuestsService,
    MstyleEventsService,
    MstyleIdempotencyService,
    MstyleRateLimitService,
    MstyleMockResponseInterceptor,
    MstyleEnabledGuard,
    MstyleServiceTokenGuard,
    MstyleRequestGuard,
    MstyleRouteContextGuard,
  ],
})
export class MstyleV2Module {}
