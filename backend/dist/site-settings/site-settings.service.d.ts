import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppSettingsDocument } from '../schemas/app-settings.schema';
import { UiLabels } from './ui-labels.defaults';
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
export declare class SiteSettingsService implements OnModuleInit {
    private appSettingsModel;
    constructor(appSettingsModel: Model<AppSettingsDocument>);
    onModuleInit(): Promise<void>;
    ensureDefaults(): Promise<void>;
    get(): Promise<SiteSettingsDto>;
    update(data: Partial<Omit<SiteSettingsDto, 'uiLabels'>> & {
        uiLabels?: Record<string, unknown>;
    }): Promise<SiteSettingsDto>;
    private map;
}
