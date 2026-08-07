import { Body, Controller, Delete, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { RenewPushSubscriptionDto } from './dto/renew-push-subscription.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications/push')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('config')
  getConfig() {
    return this.notifications.getPublicConfig();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('subscriptions')
  subscribe(@Req() req: any, @Body() dto: SavePushSubscriptionDto, @Headers('user-agent') userAgent?: string) {
    return this.notifications.saveSubscription(req.user.userId, dto, userAgent);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('subscriptions')
  unsubscribe(@Req() req: any, @Body() dto: RemovePushSubscriptionDto) {
    return this.notifications.removeSubscription(req.user.userId, dto.endpoint);
  }

  @Post('subscriptions/renew')
  renew(@Body() dto: RenewPushSubscriptionDto) {
    return this.notifications.renewSubscription(dto);
  }
}
