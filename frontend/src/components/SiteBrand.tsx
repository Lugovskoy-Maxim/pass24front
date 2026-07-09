'use client';

import { BcConfig } from '@/lib/api';
import { resolveBrand, resolveSiteIcon } from '@/lib/brand-defaults';

interface SiteBrandProps {
  config?: BcConfig | null;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  layout?: 'row' | 'column';
  variant?: 'light' | 'dark';
  className?: string;
}

const SIZES = {
  sm: {
    logo: 'h-7 w-auto max-w-[9.5rem]',
    textMark: 'h-7 min-w-[1.75rem] px-1.5 text-sm',
    title: 'text-sm',
    tagline: 'text-xs',
  },
  md: {
    logo: 'h-9 w-auto max-w-[11rem]',
    textMark: 'h-9 min-w-[2.25rem] px-2 text-base',
    title: 'text-base',
    tagline: 'text-sm',
  },
  lg: {
    logo: 'h-12 w-auto max-w-[14rem]',
    textMark: 'h-12 min-w-[3rem] px-2.5 text-xl',
    title: 'text-2xl',
    tagline: 'text-sm',
  },
};

function BrandMark({
  brand,
  size,
  iconSrc,
}: {
  brand: ReturnType<typeof resolveBrand>;
  size: keyof typeof SIZES;
  iconSrc: string;
}) {
  const s = SIZES[size];

  if (brand.brandMarkType === 'text') {
    return (
      <div
        className={`flex items-center justify-center rounded-md border font-bold leading-none shrink-0 ${s.textMark}`}
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'var(--accent-border)',
          color: 'var(--accent)',
        }}
        aria-hidden
      >
        {brand.brandMarkText}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconSrc}
      alt=""
      className={`${s.logo} object-contain object-left shrink-0`}
    />
  );
}

export function SiteBrand({
  config,
  size = 'md',
  showTagline = false,
  layout = 'row',
  variant = 'light',
  className = '',
}: SiteBrandProps) {
  const s = SIZES[size];
  const brand = resolveBrand(config);
  const iconSrc = resolveSiteIcon(config, variant);
  const isDark = variant === 'dark';
  const textColor = isDark ? 'var(--header-text)' : 'var(--foreground)';
  const mutedColor = isDark ? 'var(--header-muted)' : 'var(--muted)';

  const nameEl = brand.brandShowName ? (
    <div
      className={`font-semibold leading-tight truncate tracking-tight ${s.title}`}
      style={{ color: textColor }}
    >
      {brand.siteName}
    </div>
  ) : null;

  const markEl = <BrandMark brand={brand} size={size} iconSrc={iconSrc} />;

  const brandRow = (
    <div className={`flex gap-2.5 min-w-0 items-center ${layout === 'column' ? 'flex-col' : ''}`}>
      {brand.brandNameBeforeMark ? (
        <>
          {nameEl}
          {markEl}
        </>
      ) : (
        <>
          {markEl}
          {nameEl}
        </>
      )}
    </div>
  );

  return (
    <div
      className={`flex gap-2 ${layout === 'column' ? 'flex-col items-center text-center' : 'items-center'} ${className}`}
      aria-label={brand.siteName}
    >
      {brandRow}
      {showTagline && (
        <div
          className={`${s.tagline} ${layout === 'column' ? 'mt-0.5' : 'hidden lg:block max-w-[14rem] truncate'}`}
          style={{ color: mutedColor }}
        >
          {brand.siteTagline}
        </div>
      )}
    </div>
  );
}