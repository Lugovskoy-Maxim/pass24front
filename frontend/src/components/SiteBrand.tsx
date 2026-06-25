'use client';

import { Building2 } from 'lucide-react';
import { BcConfig } from '@/lib/api';

interface SiteBrandProps {
  config?: BcConfig | null;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  layout?: 'row' | 'column';
  className?: string;
}

const SIZES = {
  sm: { box: 'w-8 h-8', icon: 'w-4 h-4', title: 'text-sm', tagline: 'text-xs' },
  md: { box: 'w-11 h-11', icon: 'w-5 h-5', title: 'text-base', tagline: 'text-sm' },
  lg: { box: 'w-14 h-14', icon: 'w-7 h-7', title: 'text-2xl', tagline: 'text-sm' },
};

export function SiteBrand({
  config,
  size = 'md',
  showTagline = false,
  layout = 'row',
  className = '',
}: SiteBrandProps) {
  const s = SIZES[size];
  const name = config?.siteName || config?.businessCenterName || 'PASS24';
  const tagline = config?.siteTagline || 'Пропуска для арендаторов бизнес-центра';

  return (
    <div className={`flex gap-3 ${layout === 'column' ? 'flex-col items-center text-center' : 'items-center'} ${className}`}>
      <div className={`${s.box} rounded-xl bg-[var(--primary)] text-white flex items-center justify-center overflow-hidden shrink-0`}>
        {config?.siteIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.siteIcon} alt="" className="w-full h-full object-cover" />
        ) : (
          <Building2 className={s.icon} />
        )}
      </div>
      <div className="min-w-0">
        <div className={`font-bold leading-tight truncate ${s.title}`}>{name}</div>
        {showTagline && (
          <div className={`text-[var(--muted)] mt-0.5 ${s.tagline}`}>{tagline}</div>
        )}
      </div>
    </div>
  );
}