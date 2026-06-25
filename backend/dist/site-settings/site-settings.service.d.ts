import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppSettingsDocument } from '../schemas/app-settings.schema';
export interface SiteSettingsDto {
    siteName: string;
    siteIcon: string;
    siteTagline: string;
    sitePhone: string;
    siteEmail: string;
}
export declare class SiteSettingsService implements OnModuleInit {
    private appSettingsModel;
    constructor(appSettingsModel: Model<AppSettingsDocument>);
    onModuleInit(): Promise<void>;
    ensureDefaults(): Promise<void>;
    get(): Promise<SiteSettingsDto>;
    update(data: Partial<SiteSettingsDto>): Promise<SiteSettingsDto>;
    private map;
}
