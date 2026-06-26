import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSettings, AppSettingsDocument } from '../schemas/app-settings.schema';
import { deepMergeUiLabels, UiLabels } from './ui-labels.defaults';

const SETTINGS_KEY = 'global';
const MAX_ICON_LENGTH = 120_000;

export interface SiteSettingsDto {
  siteName: string;
  siteIcon: string;
  siteTagline: string;
  sitePhone: string;
  siteEmail: string;
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
      await this.appSettingsModel.create({ key: SETTINGS_KEY });
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
    if (data.siteName !== undefined) update.siteName = data.siteName.trim() || 'PASS24';
    if (data.siteIcon !== undefined) update.siteIcon = data.siteIcon.trim();
    if (data.siteTagline !== undefined) update.siteTagline = data.siteTagline.trim();
    if (data.sitePhone !== undefined) update.sitePhone = data.sitePhone.trim();
    if (data.siteEmail !== undefined) update.siteEmail = data.siteEmail.trim();
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
      siteName: doc?.siteName || 'PASS24',
      siteIcon: doc?.siteIcon || '',
      siteTagline: doc?.siteTagline || 'Пропуска для арендаторов бизнес-центра',
      sitePhone: doc?.sitePhone || '+7 (495) 123-45-67',
      siteEmail: doc?.siteEmail || 'info@pass24.local',
      uiLabels: deepMergeUiLabels(doc?.uiLabels),
    };
  }
}