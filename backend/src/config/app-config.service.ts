import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument } from '../schemas/property.schema';
import { parseClosedWeekdays } from '../common/bookable-visit-dates';
import { PropertyType } from '../schemas/enums';
import { SiteSettingsService } from '../site-settings/site-settings.service';

@Injectable()
export class AppConfigService {
  constructor(
    private readonly siteSettingsService: SiteSettingsService,
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>,
  ) {}

  async getPublicConfig() {
    const site = await this.siteSettingsService.get();
    const properties = await this.propertyModel
      .find({ type: PropertyType.BUSINESS_CENTER, isActive: true })
      .sort({ createdAt: 1 })
      .lean();
    const property = properties[0];
    const s = property?.settings || {};

    return {
      siteName: site.siteName,
      siteIcon: site.siteIcon,
      siteIconLight: site.siteIconLight,
      siteIconDark: site.siteIconDark,
      siteTagline: site.siteTagline,
      sitePhone: site.sitePhone,
      siteEmail: site.siteEmail,
      brandMarkType: site.brandMarkType,
      brandMarkText: site.brandMarkText,
      brandShowName: site.brandShowName,
      brandNameBeforeMark: site.brandNameBeforeMark,
      uiIconSelectChevron: site.uiIconSelectChevron,
      themePrimary: site.themePrimary,
      themePrimaryHover: site.themePrimaryHover,
      businessCenterName: property?.name || site.siteName,
      businessCenters: properties.map((p) => {
        const ps = p.settings || {};
        return {
          id: p._id.toString(),
          name: p.name,
          workingHoursFrom: ps.working_hours_from || '08:00',
          workingHoursTo: ps.working_hours_to || '20:00',
          requireCheckout: ps.require_checkout !== 'false',
          closedWeekdays: parseClosedWeekdays(ps.closed_weekdays),
        };
      }),
      contactPhone: s.contact_phone || site.sitePhone,
      contactEmail: s.contact_email || site.siteEmail,
      receptionFloor: s.reception_floor || '1',
      uiLabels: site.uiLabels,
      smsRegistrationEnabled: site.smsRegistrationEnabled,
      smsRegistrationDisabledMessage: site.smsRegistrationDisabledMessage,
      faqItems: site.faqItems,
    };
  }
}