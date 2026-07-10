'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { FormField, FormInput } from '@/components/FormField';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { api, getErrorMessage, PermissionMeta, TenantEmployeePosition } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

export default function AdminPositionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [positions, setPositions] = useState<TenantEmployeePosition[]>([]);
  const [assignablePermissions, setAssignablePermissions] = useState<PermissionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const canManage = hasPermission(user, 'admin.permissions') && user?.role === 'admin';

  const load = () => {
    setLoading(true);
    setLoadError('');
    setLoadErrorCause(null);
    return api.admin.getTenantEmployeePositions()
      .then(({ positions: list, assignablePermissions: perms }) => {
        setPositions(list);
        setAssignablePermissions(perms);
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPermissions([]);
    setIsDefault(false);
  };

  const startEdit = (position: TenantEmployeePosition) => {
    setEditingId(position.id);
    setName(position.name);
    setPermissions([...position.permissions]);
    setIsDefault(position.is_default);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Укажите название должности', 'error');
      return;
    }
    if (!permissions.length) {
      toast('Выберите хотя бы одно право', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { position } = await api.admin.updateTenantEmployeePosition(editingId, {
          name: name.trim(),
          permissions,
          isDefault,
        });
        setPositions((prev) => prev.map((p) => {
          if (p.id === position.id) return position;
          if (position.is_default) return { ...p, is_default: false };
          return p;
        }));
        toast('Должность обновлена', 'success');
      } else {
        const { position } = await api.admin.createTenantEmployeePosition({
          name: name.trim(),
          permissions,
          isDefault,
        });
        setPositions((prev) => {
          const next = position.is_default
            ? prev.map((p) => ({ ...p, is_default: false }))
            : prev;
          return [...next, position].sort((a, b) => {
            if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
            return a.name.localeCompare(b.name, 'ru');
          });
        });
        toast('Должность создана', 'success');
      }
      resetForm();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.admin.deleteTenantEmployeePosition(id);
      setPositions((prev) => {
        const removed = prev.find((p) => p.id === id);
        const next = prev.filter((p) => p.id !== id);
        if (removed?.is_default && next.length) {
          next[0] = { ...next[0], is_default: true };
        }
        return next;
      });
      if (editingId === id) resetForm();
      toast('Должность удалена', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (!canManage) {
    return (
      <AdminLayout title="Должности сотрудников">
        <p className="text-sm text-[var(--muted)]">Раздел доступен только супер-администратору.</p>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout title="Должности сотрудников">
        <PageError message={loadError} error={loadErrorCause} onRetry={load} retryLabel="Повторить" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Должности сотрудников">
      <p className="text-sm text-[var(--muted)] mb-6 -mt-2">
        Создавайте должности с набором прав для сотрудников арендаторов. Владелец компании выбирает должность при добавлении сотрудника.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--muted)] animate-pulse">Загрузка...</p>
      ) : positions.length > 0 ? (
        <ul className="card divide-y divide-[var(--border)] mb-6">
          {positions.map((position) => (
            <li key={position.id} className="px-4 py-3 text-sm space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {position.name}
                    {position.is_default && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                        по умолчанию
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {position.permissions.map((perm) => {
                      const meta = assignablePermissions.find((p) => p.key === perm);
                      return (
                        <span
                          key={perm}
                          className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]"
                        >
                          {meta?.label || perm}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs p-2"
                    onClick={() => startEdit(position)}
                    aria-label="Редактировать"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs p-2"
                    disabled={deletingId === position.id}
                    onClick={() => handleDelete(position.id)}
                    aria-label="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)] mb-6">Должности ещё не созданы — будет использована базовая</p>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4 max-w-xl" noValidate>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{editingId ? 'Редактировать должность' : 'Новая должность'}</h2>
          {editingId && (
            <button type="button" className="btn btn-secondary text-xs" onClick={resetForm}>
              <X className="w-3.5 h-3.5" />
              Отмена
            </button>
          )}
        </div>
        <FormField id="positionName" label="Название" required>
          <FormInput
            id="positionName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Менеджер, Секретарь, Курьер..."
          />
        </FormField>
        <div>
          <div className="text-sm font-medium mb-2">Права</div>
          <div className="space-y-2">
            {assignablePermissions.map((perm) => (
              <label key={perm.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-[var(--border)]"
                  checked={permissions.includes(perm.key)}
                  onChange={() => togglePermission(perm.key)}
                />
                <span>{perm.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-[var(--border)]"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span>Должность по умолчанию для новых сотрудников</span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Создать должность'}
        </button>
      </form>
    </AdminLayout>
  );
}