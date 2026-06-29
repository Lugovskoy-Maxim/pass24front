'use client';

import { BcConfig } from '@/lib/api';
import { resolveBrand } from '@/lib/brand-defaults';

interface SiteBrandProps {
  config?: BcConfig | null;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  layout?: 'row' | 'column';
  variant?: 'light' | 'dark';
  className?: string;
}

const SIZES = {
  sm: { logo: 'h-7 w-auto max-w-[9.5rem]', title: 'text-sm', tagline: 'text-xs' },
  md: { logo: 'h-9 w-auto max-w-[11rem]', title: 'text-base', tagline: 'text-sm' },
  lg: { logo: 'h-12 w-auto max-w-[14rem]', title: 'text-2xl', tagline: 'text-sm' },
};

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
  const isDark = variant === 'dark';
  const hasCustomName = !!config?.siteName?.trim();
  const showTitle = hasCustomName;

  return (
    <div className={`flex gap-3 ${layout === 'column' ? 'flex-col items-center text-center' : 'items-center'} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.siteIcon}
        alt={brand.siteName}
        className={`${s.logo} object-contain object-left shrink-0`}
      />
      {(showTitle || showTagline) && (
        <div className="min-w-0">
          {showTitle && (
            <div className={`font-semibold leading-tight truncate tracking-tight ${s.title}`}>{brand.siteName}</div>
          )}
          {showTagline && (
            <div
              className={`${showTitle ? 'mt-0.5' : ''} ${s.tagline}`}
              style={{ color: isDark ? 'var(--header-muted)' : 'var(--muted)' }}
            >
              {brand.siteTagline}
            </div>
          )}
        </div>
      )}
    </div>
  );
}