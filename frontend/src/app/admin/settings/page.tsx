'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { api, SystemSettings, BlacklistEntry } from '@/lib/api';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [addingPlate, setAddingPlate] = useState(false);

  const loadBlacklist = () => {
    api.admin.getBlacklist().then(({ entries }) => setBlacklist(entries)).catch(() => {});
  };

  useEffect(() => {
    api.admin.getSettings().then(({ settings: s }) => setSettings(s));
    loadBlacklist();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { settings: updated } = await api.admin.updateSettings(settings);
      setSettings(updated);
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBlacklist = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) return;
    setAddingPlate(true);
    try {
      await api.admin.addBlacklist(newPlate.trim(), newReason.trim() || undefined);
      setNewPlate('');
      setNewReason('');
      loadBlacklist();
      toast('Номер добавлен в чёрный список', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setAddingPlate(false);
    }
  };

  const handleDeleteBlacklist = async (id: string) => {
    try {
      await api.admin.deleteBlacklist(id);
      setBlacklist((prev) => prev.filter((e) => e.id !== id));
      toast('Номер удалён из чёрного списка', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  if (!settings) {
    return <AdminLayout title="Настройки БЦ"><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></AdminLayout>;
  }

  return (
    <AdminLayout title="Настройки БЦ">
      <p className="text-[var(--muted)] -mt-4 mb-6">Параметры пропускного режима бизнес-центра</p>

      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5 mb-8">
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

        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
      </form>

      <div className="max-w-xl">
        <h2 className="text-lg font-semibold mb-2">Чёрный список автомобилей</h2>
        <p className="text-sm text-[var(--muted)] mb-4">Гос. номера из списка не смогут получить парковочный пропуск</p>

        <form onSubmit={handleAddBlacklist} className="card p-4 mb-4 flex flex-col sm:flex-row gap-3">
          <input
            className="input font-mono flex-1"
            placeholder="А123ВС777"
            value={newPlate}
            onChange={(e) => setNewPlate(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="Причина (необязательно)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
          <button type="submit" className="btn btn-danger" disabled={addingPlate || !newPlate.trim()}>
            {addingPlate ? '...' : 'Добавить'}
          </button>
        </form>

        {blacklist.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">Список пуст</div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {blacklist.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <span className="font-mono font-medium">{entry.plate}</span>
                  {entry.reason && <span className="text-[var(--muted)] ml-2">— {entry.reason}</span>}
                </div>
                <button className="p-1.5 rounded hover:bg-red-50 text-red-500" onClick={() => handleDeleteBlacklist(entry.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}