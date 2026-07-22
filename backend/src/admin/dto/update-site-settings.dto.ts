import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class FaqItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите вопрос' })
  @MaxLength(300)
  question: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите ответ' })
  @MaxLength(2000)
  answer: string;
}

export class HelpGuideSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите заголовок раздела' })
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  steps?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  paragraphs?: string[];
}

export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  siteName?: string;

  /** Версия сайта в UI, напр. v.220726. Пусто — дата сборки фронта. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  siteIcon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  siteIconLight?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  siteIconDark?: string;

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
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  themePrimary?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  themePrimaryHover?: string;

  @IsOptional()
  @IsObject()
  uiLabels?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  smsRegistrationEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smsRegistrationDisabledMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  smsRegistrationCodeText?: string;

  /** Запрещённые email-домены при регистрации (по одному: gmail.com). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  blockedEmailDomains?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  faqItems?: FaqItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => HelpGuideSectionDto)
  helpGuideSections?: HelpGuideSectionDto[];
}