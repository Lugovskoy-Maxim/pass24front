'use client';

import { FormEvent, useEffect, useState } from 'react';
import { IdCard } from 'lucide-react';
import { Pass } from '@/lib/api';
import { FormField, FormInput } from '@/components/FormField';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';

interface PassVisitorDataFormProps {
  pass: Pass;
  onUpdated: (pass: Pass) => void;
}

export function PassVisitorDataForm({ pass, onUpdated }: PassVisitorDataFormProps) {
  const { toast } = useToast();
  const [series, setSeries] = useState(pass.visitorPassportSeries || '');
  const [number, setNumber] = useState(pass.visitorPassportNumber || '');
  const [issuedBy, setIssuedBy] = useState(pass.visitorPassportIssuedBy || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSeries(pass.visitorPassportSeries || '');
    setNumber(pass.visitorPassportNumber || '');
    setIssuedBy(pass.visitorPassportIssuedBy || '');
  }, [pass.id, pass.visitorPassportSeries, pass.visitorPassportNumber, pass.visitorPassportIssuedBy]);

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

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-muted)] space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        <IdCard className="w-3.5 h-3.5" />
        Паспортные данные (необязательно)
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField id={`passport-series-${pass.id}`} label="Серия">
          <FormInput id={`passport-series-${pass.id}`} value={series} onChange={(e) => setSeries(e.target.value)} placeholder="4510" maxLength={10} />
        </FormField>
        <FormField id={`passport-number-${pass.id}`} label="Номер">
          <FormInput id={`passport-number-${pass.id}`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123456" maxLength={20} />
        </FormField>
      </div>
      <FormField id={`passport-issued-${pass.id}`} label="Кем выдан">
        <FormInput id={`passport-issued-${pass.id}`} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="ОУФМС..." />
      </FormField>
      <button type="submit" className="btn btn-secondary text-sm w-full" disabled={saving}>
        {saving ? 'Сохранение...' : 'Сохранить паспортные данные'}
      </button>
    </form>
  );
}