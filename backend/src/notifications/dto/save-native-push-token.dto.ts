import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class SaveNativePushTokenDto {
  @IsString()
  @IsIn(['firebase', 'rustore', 'fcm', 'google'])
  provider: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}
