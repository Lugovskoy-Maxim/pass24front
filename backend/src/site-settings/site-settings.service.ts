import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSettings, AppSettingsDocument } from '../schemas/app-settings.schema';
import { MSTYLE_BRAND_DEFAULTS, isLegacyBrandSettings } from '../brand/brand-defaults';
import { deepMergeUiLabels, UiLabels } from './ui-labels.defaults';

const SETTINGS_KEY = 'global';
const MAX_ICON_LENGTH = 120_000;

export interface SiteSettingsDto {
  siteName: string;
  siteIcon: string;
  siteTagline: string;
  sitePhone: string;
  siteEmail: string;
  brandMarkType: string;
  brandMarkText: string;
  brandShowName: boolean;
  brandNameBeforeMark: boolean;
  uiIconSelectChevron: string;
  uiLabels: UiLabels;
}

@Injectable()
export class SiteSettingsService implements OnModuleInit {
  constructor(
    @InjectModel(AppSettings.name) private appSettingsModel: Model<AppSettingsDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    const existing = await this.appSettingsModel.findOne({ key: SETTINGS_KEY });
    if (!existing) {
      await this.appSettingsModel.create({
        key: SETTINGS_KEY,
        ...MSTYLE_BRAND_DEFAULTS,
      });
      return;
    }

    if (isLegacyBrandSettings(existing)) {
      await this.appSettingsModel.updateOne(
        { key: SETTINGS_KEY },
        { $set: { ...MSTYLE_BRAND_DEFAULTS } },
      );
    }
  }

  async get(): Promise<SiteSettingsDto> {
    const doc = await this.appSettingsModel.findOne({ key: SETTINGS_KEY }).lean();
    return this.map(doc);
  }

  async update(data: Partial<Omit<SiteSettingsDto, 'uiLabels'>> & { uiLabels?: Record<string, unknown> }): Promise<SiteSettingsDto> {
    if (data.siteIcon !== undefined && data.siteIcon.length > MAX_ICON_LENGTH) {
      throw new BadRequestException('Иконка слишком большая. Загрузите файл до 80 КБ.');
    }

    const update: Partial<AppSettings> = {};
    if (data.siteName !== undefined) update.siteName = data.siteName.trim() || MSTYLE_BRAND_DEFAULTS.siteName;
    if (data.siteIcon !== undefined) update.siteIcon = data.siteIcon.trim();
    if (data.siteTagline !== undefined) update.siteTagline = data.siteTagline.trim();
    if (data.sitePhone !== undefined) update.sitePhone = data.sitePhone.trim();
    if (data.siteEmail !== undefined) update.siteEmail = data.siteEmail.trim();
    if (data.brandMarkType !== undefined) {
      update.brandMarkType = data.brandMarkType === 'text' ? 'text' : 'image';
    }
    if (data.brandMarkText !== undefined) {
      update.brandMarkText = data.brandMarkText.trim().slice(0, 8) || MSTYLE_BRAND_DEFAULTS.brandMarkText;
    }
    if (data.brandShowName !== undefined) update.brandShowName = !!data.brandShowName;
    if (data.brandNameBeforeMark !== undefined) update.brandNameBeforeMark = !!data.brandNameBeforeMark;
    if (data.uiIconSelectChevron !== undefined) {
      update.uiIconSelectChevron = data.uiIconSelectChevron.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron;
    }
    if (data.uiLabels !== undefined) {
      update.uiLabels = deepMergeUiLabels(data.uiLabels as Record<string, unknown>);
    }

    const doc = await this.appSettingsModel
      .findOneAndUpdate({ key: SETTINGS_KEY }, { $set: update }, { new: true, upsert: true })
      .lean();

    return this.map(doc);
  }

  private map(doc?: Partial<AppSettings> | null): SiteSettingsDto {
    return {
      siteName: doc?.siteName?.trim() || MSTYLE_BRAND_DEFAULTS.siteName,
      siteIcon: doc?.siteIcon?.trim() || MSTYLE_BRAND_DEFAULTS.siteIcon,
      siteTagline: doc?.siteTagline?.trim() || MSTYLE_BRAND_DEFAULTS.siteTagline,
      sitePhone: doc?.sitePhone?.trim() || MSTYLE_BRAND_DEFAULTS.sitePhone,
      siteEmail: doc?.siteEmail?.trim() || MSTYLE_BRAND_DEFAULTS.siteEmail,
      brandMarkType: doc?.brandMarkType === 'text' ? 'text' : 'image',
      brandMarkText: doc?.brandMarkText?.trim() || MSTYLE_BRAND_DEFAULTS.brandMarkText,
      brandShowName: doc?.brandShowName !== false,
      brandNameBeforeMark: doc?.brandNameBeforeMark !== false,
      uiIconSelectChevron: doc?.uiIconSelectChevron?.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
      uiLabels: deepMergeUiLabels(doc?.uiLabels),
    };
  }
}