import { IsEmail, IsOptional, IsString } from 'class-validator';

export class BusinessCenterPassSettingsDto {
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
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  reception_floor?: string;

  @IsOptional()
  @IsString()
  require_checkout?: string;
}