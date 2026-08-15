export const MSTYLE_BRAND_DEFAULTS = {
  siteName: 'M-STYLE',
  /** Пусто: на фронте показывается версия сборки. Админ может задать, напр. v.220726 */
  appVersion: '',
  siteIcon: '/brand/mstyle-logo-light.svg',
  siteIconLight: '/brand/mstyle-logo-light.svg',
  siteIconDark: '/brand/mstyle-logo.svg',
  siteTagline: 'Пропуска для арендаторов БЦ Добрынинский и БЦ Добрынинский-2',
  sitePhone: '+7 495 663-00-00',
  siteEmail: 'renta@mstyle.ru',
  brandMarkType: 'image',
  brandMarkText: 'M',
  brandShowName: true,
  brandNameBeforeMark: true,
  uiIconSelectChevron: 'chevron-down',
  themePrimary: '#eb711c',
  themePrimaryHover: '#d55700',
  smsRegistrationEnabled: true,
  smsRegistrationDisabledMessage: 'Скоро функция будет работать',
  // Должен совпадать с одобренным шаблоном SMS Aero (подпись mts_mstyle)
  smsRegistrationCodeText: 'Ваш код для регистрации на pass.mstyle.ru - {code}',
} as const;

export const LEGACY_BRAND_DEFAULTS = {
  siteName: 'PASS',
  siteIcon: '',
  siteTagline: 'Пропуска для арендаторов бизнес-центра',
  sitePhone: '+7 (495) 123-45-67',
  siteEmail: 'service@pass.local',
} as const;

export function isLegacyBrandSettings(
  doc?: {
    siteName?: string;
    siteIcon?: string;
    siteTagline?: string;
    sitePhone?: string;
    siteEmail?: string;
  } | null,
): boolean {
  if (!doc) return false;
  const name = (doc.siteName || '').trim();
  const icon = (doc.siteIcon || '').trim();
  const tagline = (doc.siteTagline || '').trim();
  const phone = (doc.sitePhone || '').trim();
  const email = (doc.siteEmail || '').trim();

  return (
    !icon &&
    (name === LEGACY_BRAND_DEFAULTS.siteName || !name) &&
    (!tagline || tagline === LEGACY_BRAND_DEFAULTS.siteTagline) &&
    (!phone || phone === LEGACY_BRAND_DEFAULTS.sitePhone) &&
    (!email || email === LEGACY_BRAND_DEFAULTS.siteEmail)
  );
}
