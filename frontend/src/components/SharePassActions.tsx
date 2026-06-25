'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Mail, QrCode } from 'lucide-react';
import { api, getPassTicketUrl } from '@/lib/api';
import { useToast } from './Toast';

interface SharePassActionsProps {
  passIdOrNumber: string;
  passNumber?: string;
  compact?: boolean;
  showQrLink?: boolean;
}

export function SharePassActions({
  passIdOrNumber,
  passNumber,
  compact = false,
  showQrLink = true,
}: SharePassActionsProps) {
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
      toast('Ссылка на пропуск скопирована', 'success');
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

  const btnClass = compact ? 'btn text-xs py-1.5' : 'btn text-sm';

  return (
    <div className="space-y-2 w-full" onClick={(e) => e.stopPropagation()}>
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'w-full'}`}>
        {showQrLink && (
          <Link
            href={`/ticket/${encodeURIComponent(ticketNumber)}`}
            className={`${btnClass} btn-primary`}
          >
            <QrCode className="w-3.5 h-3.5" />
            QR-код
          </Link>
        )}
        <button type="button" className={`${btnClass} btn-secondary`} onClick={handleCopy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Скопировано' : 'Ссылка'}
        </button>
        <button
          type="button"
          className={`${btnClass} btn-secondary`}
          onClick={() => setShowEmailForm((v) => !v)}
        >
          <Mail className="w-3.5 h-3.5" />
          На почту
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
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </form>
      )}
    </div>
  );
}