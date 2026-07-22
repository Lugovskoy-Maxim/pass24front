'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertCircle, Check, ChevronDown, Copy, Loader2, Mail, QrCode, Share2, X } from 'lucide-react';
import { api, getPassTicketUrl } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { useToast } from './Toast';

interface SharePassActionsProps {
  passIdOrNumber: string;
  passNumber?: string;
  compact?: boolean;
  ticketLayout?: boolean;
  showQrLink?: boolean;
  /** Показать пункт «Отправить на почту» (требует авторизации) */
  enableEmailShare?: boolean;
}

type EmailModalPhase = 'form' | 'sending' | 'success' | 'error';

interface EmailSendResult {
  phase: EmailModalPhase;
  status?: number;
  message?: string;
  email?: string;
}

interface EmailModalState {
  open: boolean;
  result: EmailSendResult;
}

const INITIAL_EMAIL_MODAL: EmailModalState = {
  open: false,
  result: { phase: 'form' },
};

export function SharePassActions({
  passIdOrNumber,
  passNumber,
  compact = false,
  ticketLayout = false,
  showQrLink = true,
  enableEmailShare = false,
}: SharePassActionsProps) {
  const config = useConfig();
  const labels = getUiLabels(config);
  const ticketNumber = passNumber || passIdOrNumber;
  const ticketUrl = getPassTicketUrl(ticketNumber);
  const { toast } = useToast();

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down');
  const [emailModal, setEmailModal] = useState<EmailModalState>(INITIAL_EMAIL_MODAL);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const btnClass = compact ? 'btn text-xs py-1.5' : ticketLayout ? 'btn text-sm flex-1' : 'btn text-sm';
  const isSending = emailModal.result.phase === 'sending';
  const menuItemCount = 1 + (enableEmailShare ? 1 : 0) + (canNativeShare ? 1 : 0);

  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? menuItemCount * 44 + 16;
    const gap = 6;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const preferUp = ticketLayout || (spaceBelow < dropdownHeight + gap && spaceAbove >= spaceBelow);
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );

    setMenuPlacement(preferUp ? 'up' : 'down');
    setDropdownStyle(
      preferUp
        ? {
            position: 'fixed',
            left,
            width,
            bottom: window.innerHeight - rect.top + gap,
            zIndex: 120,
          }
        : {
            position: 'fixed',
            left,
            width,
            top: rect.bottom + gap,
            zIndex: 120,
          },
    );
  }, [menuItemCount, ticketLayout]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setDropdownStyle(null);
      return;
    }
    updateDropdownPosition();
    const frame = requestAnimationFrame(updateDropdownPosition);
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [menuOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target)
        && !dropdownRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!emailModal.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) {
        closeEmailModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [emailModal.open, isSending]);

  const closeEmailModal = () => {
    setEmailModal(INITIAL_EMAIL_MODAL);
    setEmail('');
  };

  const closeMenu = () => setMenuOpen(false);

  const handleCopyLink = async () => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setCopied(true);
      toast(labels.buttons.linkCopied, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Не удалось скопировать ссылку', 'error');
    }
  };

  const handleOpenEmailModal = () => {
    closeMenu();
    setEmailModal({ open: true, result: { phase: 'form' } });
  };

  const handleNativeShare = async () => {
    closeMenu();
    if (!canNativeShare) {
      await handleCopyLink();
      return;
    }
    try {
      await navigator.share({
        title: labels.passes.detailTitle,
        url: ticketUrl,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast('Не удалось открыть меню «Поделиться»', 'error');
      }
    }
  };

  const handleSendEmail = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isSending) return;

    setEmailModal((prev) => ({
      ...prev,
      result: { phase: 'sending' },
    }));

    const result = await api.sendPassEmailWithStatus(passIdOrNumber, trimmed);

    if (result.ok) {
      setEmailModal({
        open: true,
        result: {
          phase: 'success',
          status: result.status,
          email: result.data.email || trimmed,
          message: labels.buttons.sendEmailSuccess,
        },
      });
      toast(`${labels.buttons.sendEmailSuccess} (${result.status})`, 'success');
      return;
    }

    setEmailModal({
      open: true,
      result: {
        phase: 'error',
        status: result.status,
        message: result.message || labels.buttons.sendEmailError,
      },
    });
  };

  const menuItems = [
    {
      id: 'copy',
      icon: copied ? Check : Copy,
      label: copied ? labels.buttons.linkCopied : labels.buttons.copyLink,
      onClick: handleCopyLink,
    },
    ...(enableEmailShare
      ? [{
          id: 'email',
          icon: Mail,
          label: labels.buttons.sendToEmail,
          onClick: handleOpenEmailModal,
        }]
      : []),
    ...(canNativeShare
      ? [{
          id: 'share',
          icon: Share2,
          label: labels.buttons.shareSocial,
          onClick: handleNativeShare,
        }]
      : []),
  ];

  return (
    <>
      <div
        ref={rootRef}
        className={`share-menu w-full ${ticketLayout ? 'share-menu--ticket' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex gap-2 ${ticketLayout ? 'w-full' : compact ? 'flex-wrap' : 'flex-wrap w-full'}`}>
          {showQrLink && (
            <Link
              href={`/ticket/${encodeURIComponent(ticketNumber)}`}
              className={`${btnClass} btn-primary`}
            >
              <QrCode className="w-3.5 h-3.5" />
              {labels.buttons.qrPass}
            </Link>
          )}

          <div className={`share-menu__trigger-wrap ${ticketLayout ? 'flex-1 min-w-0' : ''}`}>
            <button
              ref={triggerRef}
              type="button"
              className={`${btnClass} btn-secondary share-menu__trigger w-full`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{labels.buttons.share}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className={`share-menu__dropdown share-menu__dropdown--portal ${menuPlacement === 'up' ? 'share-menu__dropdown--up' : ''}`}
                style={dropdownStyle ?? { position: 'fixed', left: -9999, top: -9999, visibility: 'hidden' }}
                role="menu"
              >
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="share-menu__item"
                      onClick={item.onClick}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>

      {emailModal.open && (
        <div
          className="share-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-email-title"
          onClick={() => {
            if (!isSending) closeEmailModal();
          }}
        >
          <div className="share-modal__panel" onClick={(e) => e.stopPropagation()}>
            <div className="share-modal__header">
              <h2 id="share-email-title" className="share-modal__title">
                {labels.buttons.sendEmailTitle}
              </h2>
              <button
                type="button"
                className="share-modal__close"
                aria-label={labels.buttons.cancel}
                disabled={isSending}
                onClick={closeEmailModal}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailModal.result.phase === 'form' && (
              <>
                <p className="share-modal__hint">{labels.buttons.sendEmailHint}</p>
                <form onSubmit={handleSendEmail} className="share-modal__form">
                  <input
                    className="input text-sm w-full"
                    type="email"
                    placeholder={labels.placeholders.guestEmail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                  <div className="share-modal__actions">
                    <button
                      type="button"
                      className="btn btn-secondary text-sm flex-1"
                      onClick={closeEmailModal}
                    >
                      {labels.buttons.cancel}
                    </button>
                    <button type="submit" className="btn btn-primary text-sm flex-1">
                      {labels.buttons.sendEmailSubmit}
                    </button>
                  </div>
                </form>
              </>
            )}

            {emailModal.result.phase === 'sending' && (
              <div className="share-modal__status share-modal__status--pending" role="status" aria-live="polite">
                <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                <div>
                  <div className="share-modal__status-title">{labels.buttons.sendEmailSending}</div>
                  <div className="share-modal__status-meta">Ожидание ответа сервера…</div>
                </div>
              </div>
            )}

            {emailModal.result.phase === 'success' && (
              <div className="share-modal__status share-modal__status--success" role="status" aria-live="polite">
                <Check className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="share-modal__status-title">{emailModal.result.message}</div>
                  <div className="share-modal__status-meta">
                    HTTP {emailModal.result.status ?? 200}
                    {emailModal.result.email ? ` · ${emailModal.result.email}` : ''}
                  </div>
                  <p className="share-modal__status-hint">{labels.buttons.sendEmailSuccessHint}</p>
                </div>
              </div>
            )}

            {emailModal.result.phase === 'error' && (
              <div className="share-modal__status share-modal__status--error" role="alert">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="share-modal__status-title">{labels.buttons.sendEmailError}</div>
                  <div className="share-modal__status-meta">
                    {emailModal.result.status ? `HTTP ${emailModal.result.status} · ` : ''}
                    {emailModal.result.message}
                  </div>
                </div>
              </div>
            )}

            {(emailModal.result.phase === 'success' || emailModal.result.phase === 'error') && (
              <div className="share-modal__actions share-modal__actions--footer">
                {emailModal.result.phase === 'error' && (
                  <button
                    type="button"
                    className="btn btn-secondary text-sm flex-1"
                    onClick={() => setEmailModal({ open: true, result: { phase: 'form' } })}
                  >
                    {labels.buttons.sendEmailRetry}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary text-sm flex-1"
                  onClick={closeEmailModal}
                >
                  {labels.buttons.sendEmailClose}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}