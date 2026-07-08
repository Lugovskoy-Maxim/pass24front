'use client';

import QRCode from 'react-qr-code';

const QR_CENTER_BADGE = '/brand/qr-center-badge.svg';
const MSTYLE_LOGO = '/brand/mstyle-logo.svg';

const SIZES = {
  sm: { qr: 104, logo: 24 },
  md: { qr: 168, logo: 38 },
  lg: { qr: 200, logo: 46 },
} as const;

type QrSize = keyof typeof SIZES;

interface StyledPassQrCodeProps {
  value: string;
  size?: QrSize;
  showBrand?: boolean;
  showFooter?: boolean;
  className?: string;
}

function QrCornerMarks() {
  const stroke = 5;
  const len = 28;
  const common = {
    fill: 'none' as const,
    stroke: '#2B2A29',
    strokeWidth: stroke,
    strokeLinecap: 'square' as const,
  };

  return (
    <>
      <svg className="styled-qr-card__corner styled-qr-card__corner--tl" viewBox="0 0 32 32" aria-hidden>
        <path {...common} d={`M0 ${len} V0 H${len}`} />
      </svg>
      <svg className="styled-qr-card__corner styled-qr-card__corner--tr" viewBox="0 0 32 32" aria-hidden>
        <path {...common} d={`M${32 - len} 0 H32 V${len}`} />
      </svg>
      <svg className="styled-qr-card__corner styled-qr-card__corner--bl" viewBox="0 0 32 32" aria-hidden>
        <path {...common} d={`M0 ${32 - len} V32 H${len}`} />
      </svg>
      <svg className="styled-qr-card__corner styled-qr-card__corner--br" viewBox="0 0 32 32" aria-hidden>
        <path {...common} d={`M${32 - len} 32 H32 V${32 - len}`} />
      </svg>
    </>
  );
}

export function StyledPassQrCode({
  value,
  size = 'md',
  showBrand = true,
  showFooter = true,
  className = '',
}: StyledPassQrCodeProps) {
  const dims = SIZES[size];
  const logoSize = dims.logo;

  return (
    <div className={`styled-qr-card styled-qr-card--${size} ${className}`.trim()}>
      {showBrand && (
        <header className="styled-qr-card__head">
          <div className="styled-qr-card__bar" aria-hidden />
          <div className="styled-qr-card__logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MSTYLE_LOGO} alt="M-STYLE" className="styled-qr-card__logo" />
          </div>
        </header>
      )}

      <div className="styled-qr-card__matrix">
        <QrCornerMarks />
        <div className="styled-qr-card__code" style={{ width: dims.qr, height: dims.qr }}>
          <QRCode
            value={value}
            size={dims.qr}
            level="H"
            fgColor="#2B2A29"
            bgColor="#FEFEFE"
            style={{ width: '100%', height: '100%' }}
          />
          <div
            className="styled-qr-card__center-badge"
            style={{ width: logoSize, height: logoSize }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={QR_CENTER_BADGE} alt="" width={logoSize} height={logoSize} />
          </div>
        </div>
      </div>

      {showFooter && (
        <footer className="styled-qr-card__foot">
          <div className="styled-qr-card__bar" aria-hidden />
          <span className="styled-qr-card__site">mstyle.ru</span>
        </footer>
      )}
    </div>
  );
}