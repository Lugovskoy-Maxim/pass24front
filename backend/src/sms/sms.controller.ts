/**
 * Публичный callback SMS Aero Mobile ID (статусы доставки).
 * URL должен быть доступен из интернета: {PUBLIC_APP_URL}/api/sms/mobile-id/callback
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('mobile-id/callback')
  @HttpCode(200)
  mobileIdCallback(@Body() body: unknown) {
    return this.smsService.handleMobileIdCallback(body);
  }
}
