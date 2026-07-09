const DEFAULT_PRIMARY = '#eb711c';
const DEFAULT_PRIMARY_HOVER = '#d55700';

function hexToRgb(hex: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

export function applyThemeColors(primary?: string, primaryHover?: string) {
  if (typeof document === 'undefined') return;

  const main = primary?.trim() || DEFAULT_PRIMARY;
  const hover = primaryHover?.trim() || DEFAULT_PRIMARY_HOVER;
  const root = document.documentElement;

  root.style.setProperty('--primary', main);
  root.style.setProperty('--m-accent', main);
  root.style.setProperty('--accent', main);
  root.style.setProperty('--primary-hover', hover);
  root.style.setProperty('--m-accent-hover', hover);
  root.style.setProperty('--accent-hover', hover);
  root.style.setProperty('--nav-active-indicator', main);

  const rgb = hexToRgb(main);
  if (rgb) {
    root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);
    root.style.setProperty('--accent-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`);
  }
}

export const THEME_COLOR_DEFAULTS = {
  themePrimary: DEFAULT_PRIMARY,
  themePrimaryHover: DEFAULT_PRIMARY_HOVER,
} as const;