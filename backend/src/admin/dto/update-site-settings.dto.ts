import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  siteName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  siteIcon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteTagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sitePhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  siteEmail?: string;

  @IsOptional()
  @IsObject()
  uiLabels?: Record<string, unknown>;
}