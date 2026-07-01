export const MSTYLE_BRAND_DEFAULTS = {
  siteName: 'M-STYLE',
  siteIcon: '/brand/mstyle-logo.svg',
  siteTagline: 'Пропуска для арендаторов бизнес-центра',
  sitePhone: '+7 495 663-00-00',
  siteEmail: 'renta@mstyle.ru',
  brandMarkType: 'image',
  brandMarkText: 'M',
  brandShowName: true,
  brandNameBeforeMark: true,
  uiIconSelectChevron: 'chevron-down',
} as const;

export const LEGACY_BRAND_DEFAULTS = {
  siteName: 'PASS24',
  siteIcon: '',
  siteTagline: 'Пропуска для арендаторов бизнес-центра',
  sitePhone: '+7 (495) 123-45-67',
  siteEmail: 'info@pass24.local',
} as const;

export function isLegacyBrandSettings(doc?: {
  siteName?: string;
  siteIcon?: string;
  siteTagline?: string;
  sitePhone?: string;
  siteEmail?: string;
} | null): boolean {
  if (!doc) return false;
  const name = (doc.siteName || '').trim();
  const icon = (doc.siteIcon || '').trim();
  const tagline = (doc.siteTagline || '').trim();
  const phone = (doc.sitePhone || '').trim();
  const email = (doc.siteEmail || '').trim();

  return (
    !icon
    && (name === LEGACY_BRAND_DEFAULTS.siteName || !name)
    && (!tagline || tagline === LEGACY_BRAND_DEFAULTS.siteTagline)
    && (!phone || phone === LEGACY_BRAND_DEFAULTS.sitePhone)
    && (!email || email === LEGACY_BRAND_DEFAULTS.siteEmail)
  );
}