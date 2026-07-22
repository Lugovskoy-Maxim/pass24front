'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ChevronDown, IdCard } from 'lucide-react';
import { Pass } from '@/lib/api';
import { FormField, FormInput } from '@/components/FormField';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';

interface PassVisitorDataFormProps {
  pass: Pass;
  onUpdated: (pass: Pass) => void;
  collapsible?: boolean;
}

export function PassVisitorDataForm({ pass, onUpdated, collapsible = true }: PassVisitorDataFormProps) {
  const { toast } = useToast();
  const ph = getUiLabels(useConfig()).placeholders;
  const [series, setSeries] = useState(pass.visitorPassportSeries || '');
  const [number, setNumber] = useState(pass.visitorPassportNumber || '');
  const [issuedBy, setIssuedBy] = useState(pass.visitorPassportIssuedBy || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSeries(pass.visitorPassportSeries || '');
    setNumber(pass.visitorPassportNumber || '');
    setIssuedBy(pass.visitorPassportIssuedBy || '');
  }, [pass.id, pass.visitorPassportSeries, pass.visitorPassportNumber, pass.visitorPassportIssuedBy]);

  const hasData = !!(pass.visitorPassportSeries || pass.visitorPassportNumber || pass.visitorPassportIssuedBy);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { pass: updated } = await api.updatePassVisitorData(pass.id, {
        visitorPassportSeries: series.trim() || undefined,
        visitorPassportNumber: number.trim() || undefined,
        visitorPassportIssuedBy: issuedBy.trim() || undefined,
      });
      onUpdated(updated);
      toast('Паспортные данные сохранены', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fields = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <FormField id={`passport-series-${pass.id}`} label="Серия">
          <FormInput id={`passport-series-${pass.id}`} value={series} onChange={(e) => setSeries(e.target.value)} placeholder={ph.passportSeries} maxLength={10} />
        </FormField>
        <FormField id={`passport-number-${pass.id}`} label="Номер">
          <FormInput id={`passport-number-${pass.id}`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={ph.passportNumber} maxLength={20} />
        </FormField>
      </div>
      <FormField id={`passport-issued-${pass.id}`} label="Кем выдан">
        <FormInput id={`passport-issued-${pass.id}`} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder={ph.passportIssuedBy} />
      </FormField>
      <button type="submit" className="btn btn-secondary text-sm w-full" disabled={saving}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </>
  );

  if (!collapsible) {
    return (
      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-muted)] space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          <IdCard className="w-3.5 h-3.5" />
          Паспортные данные (необязательно)
        </div>
        {fields}
      </form>
    );
  }

  return (
    <details className="pass-passport-spoiler border-t border-[var(--border)] bg-[var(--surface-muted)]">
      <summary className="pass-passport-spoiler__summary">
        <span className="flex items-center gap-2 min-w-0">
          <IdCard className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Паспортные данные</span>
          {hasData && (
            <span className="text-[10px] font-medium normal-case tracking-normal text-[var(--accent)] shrink-0">
              заполнено
            </span>
          )}
        </span>
        <ChevronDown className="pass-passport-spoiler__chevron w-4 h-4 shrink-0" aria-hidden />
      </summary>
      <form onSubmit={handleSubmit} className="pass-passport-spoiler__body space-y-3">
        {fields}
      </form>
    </details>
  );
}