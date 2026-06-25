import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  business_center_name?: string;

  @IsOptional()
  @IsString()
  max_passes_per_day?: string;

  @IsOptional()
  @IsString()
  auto_approve_delivery?: string;

  @IsOptional()
  @IsString()
  working_hours_from?: string;

  @IsOptional()
  @IsString()
  working_hours_to?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsString()
  contact_email?: string;

  @IsOptional()
  @IsString()
  reception_floor?: string;
}