import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @IsIn(['image', 'text'])
  brandMarkType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  brandMarkText?: string;

  @IsOptional()
  @IsBoolean()
  brandShowName?: boolean;

  @IsOptional()
  @IsBoolean()
  brandNameBeforeMark?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  uiIconSelectChevron?: string;

  @IsOptional()
  @IsObject()
  uiLabels?: Record<string, unknown>;
}