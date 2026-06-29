import { BcConfig } from '@/lib/api';

export const MSTYLE_BRAND_DEFAULTS = {
  siteName: 'M-STYLE',
  siteIcon: '/brand/mstyle-logo.svg',
  siteTagline: 'Пропуска для арендаторов бизнес-центра',
  sitePhone: '+7 495 663-00-00',
  siteEmail: 'renta@mstyle.ru',
} as const;

export type BrandFields = Pick<BcConfig, 'siteName' | 'siteIcon' | 'siteTagline' | 'sitePhone' | 'siteEmail'>;

export function resolveBrand(config?: Partial<BrandFields> | null): Required<BrandFields> {
  return {
    siteName: config?.siteName?.trim() || MSTYLE_BRAND_DEFAULTS.siteName,
    siteIcon: config?.siteIcon?.trim() || MSTYLE_BRAND_DEFAULTS.siteIcon,
    siteTagline: config?.siteTagline?.trim() || MSTYLE_BRAND_DEFAULTS.siteTagline,
    sitePhone: config?.sitePhone?.trim() || MSTYLE_BRAND_DEFAULTS.sitePhone,
    siteEmail: config?.siteEmail?.trim() || MSTYLE_BRAND_DEFAULTS.siteEmail,
  };
}