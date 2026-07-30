/**
 * Блок «Офис» справа на карточке/в деталях.
 * Короткие номера (401) — крупно; текстовые названия («Спорт Экспрес») — мельче, с переносом.
 */
import { isShortOfficeCode } from '@/lib/pass-display';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  office?: string | null;
  floor?: string | null;
  businessCenterName?: string | null;
  /** Подпись сверху («Офис») */
  label: string;
  floorSuffix?: string;
  /** title / aria — полная строка назначения */
  title?: string;
  size?: Size;
  className?: string;
  /** Выравнивание (карточка — right, детали — center) */
  align?: 'right' | 'center';
};

const codeSizeClass: Record<Size, string> = {
  sm: 'text-2xl',
  md: 'text-2xl',
  lg: 'text-3xl',
};

const nameSizeClass: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function PassOfficeHighlight({
  office,
  floor,
  businessCenterName,
  label,
  floorSuffix = 'эт.',
  title,
  size = 'md',
  className = '',
  align = 'right',
}: Props) {
  const value = (office || '').trim() || '—';
  const shortCode = isShortOfficeCode(office);
  const alignClass = align === 'center' ? 'text-center' : 'text-right';

  return (
    <div
      className={[
        'pass-card__office pass-card__office--side min-w-0',
        shortCode ? 'pass-card__office--code' : 'pass-card__office--named',
        alignClass,
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className={`text-[9px] sm:text-[10px] uppercase tracking-wide text-[var(--muted)] leading-none mb-0.5 truncate ${alignClass}`}>
        {label}
      </div>
      <div
        className={[
          'font-bold text-[var(--text)] min-w-0',
          shortCode
            ? `pass-card__office-value pass-card__office-value--code leading-none tabular-nums truncate ${codeSizeClass[size]}`
            : `pass-card__office-value pass-card__office-value--name ${nameSizeClass[size]}`,
        ].join(' ')}
        title={title || value}
      >
        {value}
      </div>
      {floor && (
        <div
          className="text-[10px] sm:text-xs text-[var(--muted)] mt-0.5 truncate"
          title={`${floor} ${floorSuffix}`}
        >
          {floor} {floorSuffix}
        </div>
      )}
      {businessCenterName && (
        <div
          className="text-[9px] sm:text-[10px] text-[var(--muted)] mt-0.5 leading-tight line-clamp-2"
          title={businessCenterName}
        >
          {businessCenterName}
        </div>
      )}
    </div>
  );
}
