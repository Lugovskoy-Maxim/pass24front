'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export function AdminModal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={onClose}
    >
      <div
        className={`admin-modal__panel ${wide ? 'admin-modal__panel--wide' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__header">
          <h2 id="admin-modal-title" className="share-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="share-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
      </div>
    </div>
  );
}
