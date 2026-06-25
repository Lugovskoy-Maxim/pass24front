import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument } from '../schemas/property.schema';
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
    const property = await this.propertyModel
      .findOne({ type: PropertyType.BUSINESS_CENTER, isActive: true })
      .sort({ createdAt: 1 })
      .lean();
    const s = property?.settings || {};

    return {
      siteName: site.siteName,
      siteIcon: site.siteIcon,
      siteTagline: site.siteTagline,
      sitePhone: site.sitePhone,
      siteEmail: site.siteEmail,
      businessCenterName: property?.name || site.siteName,
      workingHoursFrom: s.working_hours_from || '08:00',
      workingHoursTo: s.working_hours_to || '20:00',
      contactPhone: s.contact_phone || site.sitePhone,
      contactEmail: s.contact_email || site.siteEmail,
      receptionFloor: s.reception_floor || '1',
      maxPassesPerDay: Number(s.max_passes_per_day || 200),
    };
  }
}