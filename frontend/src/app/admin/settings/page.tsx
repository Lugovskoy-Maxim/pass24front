'use client';

import { useEffect, useState, FormEvent } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, SystemSettings } from '@/lib/api';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.admin.getSettings().then(({ settings: s }) => setSettings(s));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { settings: updated } = await api.admin.updateSettings(settings);
      setSettings(updated);
      setMessage('Настройки сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <AdminLayout title="Настройки БЦ"><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></AdminLayout>;
  }

  return (
    <AdminLayout title="Настройки БЦ">
      <p className="text-[var(--muted)] -mt-4 mb-6">Параметры пропускного режима бизнес-центра</p>

      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5">
        <div>
          <label className="label">Название бизнес-центра</label>
          <input className="input" value={settings.business_center_name} onChange={(e) => setSettings({ ...settings, business_center_name: e.target.value })} />
        </div>

        <div>
          <label className="label">Этаж ресепшн</label>
          <input className="input" value={settings.reception_floor} onChange={(e) => setSettings({ ...settings, reception_floor: e.target.value })} placeholder="1" />
        </div>

        <div>
          <label className="label">Лимит пропусков на арендатора в день</label>
          <input className="input" type="number" min={1} max={100} value={settings.max_passes_per_day} onChange={(e) => setSettings({ ...settings, max_passes_per_day: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.auto_approve_delivery === 'true'} onChange={(e) => setSettings({ ...settings, auto_approve_delivery: e.target.checked ? 'true' : 'false' })} />
          Автоодобрение пропусков на доставку
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Рабочие часы с</label>
            <input className="input" type="time" value={settings.working_hours_from} onChange={(e) => setSettings({ ...settings, working_hours_from: e.target.value })} />
          </div>
          <div>
            <label className="label">Рабочие часы до</label>
            <input className="input" type="time" value={settings.working_hours_to} onChange={(e) => setSettings({ ...settings, working_hours_to: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Телефон ресепшн</label>
          <input className="input" value={settings.contact_phone} onChange={(e) => setSettings({ ...settings, contact_phone: e.target.value })} />
        </div>

        <div>
          <label className="label">Email управляющей компании</label>
          <input className="input" type="email" value={settings.contact_email} onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })} />
        </div>

        {message && <div className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-md">{message}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </form>
    </AdminLayout>
  );
}