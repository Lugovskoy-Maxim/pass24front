import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessCenterPassSettingsDto)
  passSettings?: BusinessCenterPassSettingsDto;
}