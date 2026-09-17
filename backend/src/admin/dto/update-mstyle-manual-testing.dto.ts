import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateMstyleManualTestingDto {
  @IsBoolean()
  enabled: boolean;

  @IsEmail()
  deliveryEmail: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}
