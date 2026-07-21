import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSettings, AppSettingsDocument } from '../schemas/app-settings.schema';
import { MSTYLE_BRAND_DEFAULTS, isLegacyBrandSettings } from '../brand/brand-defaults';
import { DEFAULT_FAQ_ITEMS, NormalizedFaqItem, normalizeFaqItems } from './faq-defaults';
import { deepMergeUiLabels, UiLabels } from './ui-labels.defaults';

const SETTINGS_KEY = 'global';
const MAX_ICON_LENGTH = 120_000;

export interface SiteSettingsDto {
  siteName: string;
  siteIcon: string;
  siteIconLight: string;
  siteIconDark: string;
  siteTagline: string;
  sitePhone: string;
  siteEmail: string;
  brandMarkType: string;
  brandMarkText: string;
  brandShowName: boolean;
  brandNameBeforeMark: boolean;
  uiIconSelectChevron: string;
  themePrimary: string;
  themePrimaryHover: string;
  uiLabels: UiLabels;
  smsRegistrationEnabled: boolean;
  smsRegistrationDisabledMessage: string;
  smsRegistrationCodeText: string;
  faqItems: NormalizedFaqItem[];
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

  async update(data: {
    siteName?: string;
    siteIcon?: string;
    siteIconLight?: string;
    siteIconDark?: string;
    siteTagline?: string;
    sitePhone?: string;
    siteEmail?: string;
    brandMarkType?: string;
    brandMarkText?: string;
    brandShowName?: boolean;
    brandNameBeforeMark?: boolean;
    uiIconSelectChevron?: string;
    themePrimary?: string;
    themePrimaryHover?: string;
    uiLabels?: Record<string, unknown>;
    smsRegistrationEnabled?: boolean;
    smsRegistrationDisabledMessage?: string;
    smsRegistrationCodeText?: string;
    /** Сырой список из DTO — id опционален, нормализуется внутри */
    faqItems?: Array<{ id?: string; question?: string; answer?: string }>;
  }): Promise<SiteSettingsDto> {
    for (const field of ['siteIcon', 'siteIconLight', 'siteIconDark'] as const) {
      const value = data[field];
      if (value !== undefined && value.length > MAX_ICON_LENGTH) {
        throw new BadRequestException('Иконка слишком большая. Загрузите файл до 80 КБ.');
      }
    }

    const update: Partial<AppSettings> = {};
    if (data.siteName !== undefined) update.siteName = data.siteName.trim() || MSTYLE_BRAND_DEFAULTS.siteName;
    if (data.siteIcon !== undefined) update.siteIcon = data.siteIcon.trim();
    if (data.siteIconLight !== undefined) {
      update.siteIconLight = data.siteIconLight.trim();
      update.siteIcon = data.siteIconLight.trim();
    }
    if (data.siteIconDark !== undefined) update.siteIconDark = data.siteIconDark.trim();
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
    if (data.themePrimary !== undefined) {
      update.themePrimary = this.normalizeHexColor(data.themePrimary, MSTYLE_BRAND_DEFAULTS.themePrimary);
    }
    if (data.themePrimaryHover !== undefined) {
      update.themePrimaryHover = this.normalizeHexColor(data.themePrimaryHover, MSTYLE_BRAND_DEFAULTS.themePrimaryHover);
    }
    if (data.uiLabels !== undefined) {
      update.uiLabels = deepMergeUiLabels(data.uiLabels as Record<string, unknown>);
    }
    if (data.smsRegistrationEnabled !== undefined) {
      update.smsRegistrationEnabled = !!data.smsRegistrationEnabled;
    }
    if (data.smsRegistrationDisabledMessage !== undefined) {
      const message = data.smsRegistrationDisabledMessage.trim();
      update.smsRegistrationDisabledMessage = message
        || MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage;
    }
    if (data.smsRegistrationCodeText !== undefined) {
      const text = data.smsRegistrationCodeText.trim();
      update.smsRegistrationCodeText = text.includes('{code}')
        ? text
        : MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText;
    }
    if (data.faqItems !== undefined) {
      update.faqItems = normalizeFaqItems(data.faqItems);
    }

    const doc = await this.appSettingsModel
      .findOneAndUpdate({ key: SETTINGS_KEY }, { $set: update }, { new: true, upsert: true })
      .lean();

    return this.map(doc);
  }

  private map(doc?: Partial<AppSettings> | null): SiteSettingsDto {
    const legacyIcon = doc?.siteIcon?.trim() || '';
    const siteIconLight = doc?.siteIconLight?.trim() || legacyIcon || MSTYLE_BRAND_DEFAULTS.siteIconLight;
    const siteIconDark = doc?.siteIconDark?.trim() || legacyIcon || MSTYLE_BRAND_DEFAULTS.siteIconDark;

    return {
      siteName: doc?.siteName?.trim() || MSTYLE_BRAND_DEFAULTS.siteName,
      siteIcon: siteIconLight,
      siteIconLight,
      siteIconDark,
      siteTagline: doc?.siteTagline?.trim() || MSTYLE_BRAND_DEFAULTS.siteTagline,
      sitePhone: doc?.sitePhone?.trim() || MSTYLE_BRAND_DEFAULTS.sitePhone,
      siteEmail: doc?.siteEmail?.trim() || MSTYLE_BRAND_DEFAULTS.siteEmail,
      brandMarkType: doc?.brandMarkType === 'text' ? 'text' : 'image',
      brandMarkText: doc?.brandMarkText?.trim() || MSTYLE_BRAND_DEFAULTS.brandMarkText,
      brandShowName: doc?.brandShowName !== false,
      brandNameBeforeMark: doc?.brandNameBeforeMark !== false,
      uiIconSelectChevron: doc?.uiIconSelectChevron?.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
      themePrimary: this.normalizeHexColor(doc?.themePrimary, MSTYLE_BRAND_DEFAULTS.themePrimary),
      themePrimaryHover: this.normalizeHexColor(doc?.themePrimaryHover, MSTYLE_BRAND_DEFAULTS.themePrimaryHover),
      uiLabels: deepMergeUiLabels(doc?.uiLabels),
      smsRegistrationEnabled: doc?.smsRegistrationEnabled !== false,
      smsRegistrationDisabledMessage: doc?.smsRegistrationDisabledMessage?.trim()
        || MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage,
      smsRegistrationCodeText: doc?.smsRegistrationCodeText?.trim()?.includes('{code}')
        ? doc.smsRegistrationCodeText.trim()
        : MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText,
      faqItems: normalizeFaqItems(doc?.faqItems?.length ? doc.faqItems : DEFAULT_FAQ_ITEMS),
    };
  }

  private normalizeHexColor(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim() || '';
    return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
  }
}