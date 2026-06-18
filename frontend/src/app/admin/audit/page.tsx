'use client';

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AuditEntry, AUDIT_LABELS } from '@/lib/api';

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = (off = 0) => {
    setLoading(true);
    api.admin.getAudit(off)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
        setOffset(off);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout title="Журнал действий">
      <p className="text-[var(--muted)] -mt-4 mb-6">Официальный аудит всех операций в системе</p>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[var(--muted)]">
            <tr>
              <th className="text-left p-3 font-medium">Время</th>
              <th className="text-left p-3 font-medium">Действие</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Пользователь</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Объект</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-[var(--muted)]">Загрузка...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-[var(--muted)]">Записей нет</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)]">
                <td className="p-3 text-[var(--muted)] whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString('ru-RU')}
                </td>
                <td className="p-3 font-medium">{AUDIT_LABELS[e.action] || e.action}</td>
                <td className="p-3 hidden md:table-cell">{e.userName || e.userEmail || '—'}</td>
                <td className="p-3 hidden sm:table-cell text-[var(--muted)]">
                  {e.entityType}{e.entityId ? ` #${e.entityId.slice(0, 8)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button className="btn btn-secondary text-sm" disabled={offset === 0} onClick={() => load(Math.max(0, offset - 50))}>Назад</button>
          <span className="text-sm text-[var(--muted)] self-center">{offset + 1}–{Math.min(offset + 50, total)} из {total}</span>
          <button className="btn btn-secondary text-sm" disabled={offset + 50 >= total} onClick={() => load(offset + 50)}>Далее</button>
        </div>
      )}
    </AdminLayout>
  );
}