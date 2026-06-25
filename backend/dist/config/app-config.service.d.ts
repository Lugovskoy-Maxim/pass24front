import { Model } from 'mongoose';
import { PropertyDocument } from '../schemas/property.schema';
import { SiteSettingsService } from '../site-settings/site-settings.service';
export declare class AppConfigService {
    private readonly siteSettingsService;
    private propertyModel;
    constructor(siteSettingsService: SiteSettingsService, propertyModel: Model<PropertyDocument>);
    getPublicConfig(): Promise<{
        siteName: string;
        siteIcon: string;
        siteTagline: string;
        sitePhone: string;
        siteEmail: string;
        businessCenterName: string;
        workingHoursFrom: any;
        workingHoursTo: any;
        contactPhone: any;
        contactEmail: any;
        receptionFloor: any;
        maxPassesPerDay: number;
    }>;
}
