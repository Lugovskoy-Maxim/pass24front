import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BusinessCenterPassSettingsDto } from './business-center-pass-settings.dto';

export class UpdateBusinessCenterDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  address?: string;

  /** Ключ сайта, напр. tf-business-center:12. Пусто — снять привязку. */
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessCenterPassSettingsDto)
  passSettings?: BusinessCenterPassSettingsDto;
}
