import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthDatabaseModule } from '../database/auth-database.module';
import {
  PushSubscription,
  PushSubscriptionSchema,
  User,
  UserSchema,
  VapidConfig,
  VapidConfigSchema,
} from '../schemas';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    AuthDatabaseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      { name: User.name, schema: UserSchema },
      { name: VapidConfig.name, schema: VapidConfigSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
