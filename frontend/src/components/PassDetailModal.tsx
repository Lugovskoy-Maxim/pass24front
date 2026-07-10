'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface PassDetailModalProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function PassDetailModal({ open, title, closeLabel, onClose, children }: PassDetailModalProps) {
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
      className="share-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pass-detail-modal-title"
      onClick={onClose}
    >
      <div className="pass-detail-modal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="pass-detail-modal__header">
          <h2 id="pass-detail-modal-title" className="share-modal__title">{title}</h2>
          <button
            type="button"
            className="share-modal__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="pass-detail-modal__body">
          {children}
        </div>
      </div>
    </div>
  );
}