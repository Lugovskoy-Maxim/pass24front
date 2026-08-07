import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

class RenewPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class RenewPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  renewalToken: string;

  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ValidateNested()
  @Type(() => RenewPushSubscriptionKeysDto)
  keys: RenewPushSubscriptionKeysDto;
}
