import { Global, Module } from '@nestjs/common';
import { TelegramGatewayService } from './telegram-gateway.service';

@Global()
@Module({
  providers: [TelegramGatewayService],
  exports: [TelegramGatewayService],
})
export class TelegramModule {}
