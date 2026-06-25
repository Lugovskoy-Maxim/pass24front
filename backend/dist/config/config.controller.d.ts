import { AccessConfigService } from '../access/access-config.service';
import { AppConfigService } from './app-config.service';
export declare class ConfigController {
    private readonly accessConfigService;
    private readonly appConfigService;
    constructor(accessConfigService: AccessConfigService, appConfigService: AppConfigService);
    getConfig(): Promise<{
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
    getAccessConfig(req: any): Promise<{
        enabledPassTypes: any;
        passTypeLabels: Record<string, string>;
        permissions: string[];
        rolePermissions: any;
    }>;
}
