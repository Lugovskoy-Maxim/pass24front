'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Mail, QrCode } from 'lucide-react';
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
}

export function SharePassActions({
  passIdOrNumber,
  passNumber,
  compact = false,
  ticketLayout = false,
  showQrLink = true,
}: SharePassActionsProps) {
  const config = useConfig();
  const labels = getUiLabels(config);
  const ticketNumber = passNumber || passIdOrNumber;
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getPassTicketUrl(ticketNumber));
      setCopied(true);
      toast(labels.buttons.linkCopied, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Не удалось скопировать ссылку', 'error');
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
      setShowEmailForm(false);
      setEmail('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось отправить письмо', 'error');
    } finally {
      setSending(false);
    }
  };

  const btnClass = compact ? 'btn text-xs py-1.5' : ticketLayout ? 'btn text-sm flex-1' : 'btn text-sm';

  return (
    <div className="space-y-2 w-full" onClick={(e) => e.stopPropagation()}>
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
        <button type="button" className={`${btnClass} btn-secondary`} onClick={handleCopy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? labels.buttons.linkCopied : labels.buttons.copyLink}
        </button>
        <button
          type="button"
          className={`${btnClass} btn-secondary`}
          onClick={() => setShowEmailForm((v) => !v)}
        >
          <Mail className="w-3.5 h-3.5" />
          {labels.buttons.share}
        </button>
      </div>

      {showEmailForm && (
        <form onSubmit={handleSendEmail} className="flex flex-col sm:flex-row gap-2">
          <input
            className="input text-sm flex-1"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className={`${btnClass} btn-primary shrink-0`} disabled={sending}>
            {sending ? '...' : labels.buttons.apply}
          </button>
        </form>
      )}
    </div>
  );
}