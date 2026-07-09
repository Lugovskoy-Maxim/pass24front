import { BcConfig } from '@/lib/api';

export const MSTYLE_BRAND_DEFAULTS = {
  siteName: 'M-STYLE',
  siteIcon: '/brand/mstyle-logo.svg',
  siteTagline: 'Пропуска для арендаторов бизнес-центра',
  sitePhone: '+7 495 663-00-00',
  siteEmail: 'renta@mstyle.ru',
  brandMarkType: 'image' as const,
  brandMarkText: 'M',
  brandShowName: true,
  brandNameBeforeMark: true,
  uiIconSelectChevron: 'chevron-down',
  themePrimary: '#eb711c',
  themePrimaryHover: '#d55700',
};

export type BrandFields = Pick<
  BcConfig,
  | 'siteName'
  | 'siteIcon'
  | 'siteTagline'
  | 'sitePhone'
  | 'siteEmail'
  | 'brandMarkType'
  | 'brandMarkText'
  | 'brandShowName'
  | 'brandNameBeforeMark'
  | 'uiIconSelectChevron'
>;

export function resolveBrand(config?: Partial<BrandFields> | null): Required<BrandFields> {
  return {
    siteName: config?.siteName?.trim() || MSTYLE_BRAND_DEFAULTS.siteName,
    siteIcon: config?.siteIcon?.trim() || MSTYLE_BRAND_DEFAULTS.siteIcon,
    siteTagline: config?.siteTagline?.trim() || MSTYLE_BRAND_DEFAULTS.siteTagline,
    sitePhone: config?.sitePhone?.trim() || MSTYLE_BRAND_DEFAULTS.sitePhone,
    siteEmail: config?.siteEmail?.trim() || MSTYLE_BRAND_DEFAULTS.siteEmail,
    brandMarkType: config?.brandMarkType === 'text' ? 'text' : 'image',
    brandMarkText: config?.brandMarkText?.trim() || MSTYLE_BRAND_DEFAULTS.brandMarkText,
    brandShowName: config?.brandShowName !== false,
    brandNameBeforeMark: config?.brandNameBeforeMark !== false,
    uiIconSelectChevron: config?.uiIconSelectChevron?.trim() || MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
  };
}