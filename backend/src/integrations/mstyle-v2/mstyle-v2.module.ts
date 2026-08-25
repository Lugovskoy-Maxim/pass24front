import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthDatabaseModule } from '../../database/auth-database.module';
import { User, UserSchema } from '../../schemas';
import { MstyleAuthService } from './mstyle-v2.auth.service';
import { MstyleV2Config } from './mstyle-v2.config';
import { MstyleDirectoryService } from './mstyle-v2.directory.service';
import { MstyleEventsService } from './mstyle-v2.events';
import { MstyleGuestsService } from './mstyle-v2.guests.service';
import {
  MstyleEnabledGuard,
  MstyleRequestGuard,
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

@Module({
  imports: [
    AuthDatabaseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature(MSTYLE_MODELS),
  ],
  exports: [MstyleIdentityService, MstyleOauthService, MstyleV2Config],
  controllers: [MstyleOauthController, MstylePrivateController],
  providers: [
    MstyleV2Config,
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
  ],
})
export class MstyleV2Module {}
