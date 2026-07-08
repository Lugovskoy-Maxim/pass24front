'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Copy, Mail, QrCode, Share2, X } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const btnClass = compact ? 'btn text-xs py-1.5' : ticketLayout ? 'btn text-sm flex-1' : 'btn text-sm';

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
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
    if (!emailModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) {
        setEmailModalOpen(false);
        setEmail('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [emailModalOpen, sending]);

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
    setEmailModalOpen(true);
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
    if (!trimmed) return;
    setSending(true);
    try {
      await api.sendPassEmail(passIdOrNumber, trimmed);
      toast(`Пропуск отправлен на ${trimmed}`, 'success');
      setEmailModalOpen(false);
      setEmail('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось отправить письмо', 'error');
    } finally {
      setSending(false);
    }
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

            {menuOpen && (
              <div
                className={`share-menu__dropdown ${ticketLayout ? 'share-menu__dropdown--up' : ''}`}
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
              </div>
            )}
          </div>
        </div>
      </div>

      {emailModalOpen && (
        <div
          className="share-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-email-title"
          onClick={() => {
            if (!sending) {
              setEmailModalOpen(false);
              setEmail('');
            }
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
                disabled={sending}
                onClick={() => {
                  setEmailModalOpen(false);
                  setEmail('');
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="share-modal__hint">{labels.buttons.sendEmailHint}</p>
            <form onSubmit={handleSendEmail} className="share-modal__form">
              <input
                className="input text-sm w-full"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                disabled={sending}
              />
              <div className="share-modal__actions">
                <button
                  type="button"
                  className="btn btn-secondary text-sm flex-1"
                  disabled={sending}
                  onClick={() => {
                    setEmailModalOpen(false);
                    setEmail('');
                  }}
                >
                  {labels.buttons.cancel}
                </button>
                <button type="submit" className="btn btn-primary text-sm flex-1" disabled={sending}>
                  {sending ? '...' : labels.buttons.sendEmailSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}