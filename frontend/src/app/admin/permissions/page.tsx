'use client';

import { Fragment, useEffect, useState, FormEvent } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api, AccessConfig, PassType, ROLE_LABELS, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { hasPermission } from '@/lib/permissions';

function roleLabel(config: AccessConfig, role: string) {
  return config.roleLabels?.[role] || ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role;
}

export default function AdminPermissionsPage() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);

  const load = () => {
    setLoadError('');
    setLoadErrorCause(null);
    api.admin.getAccessConfig()
      .then(setConfig)
      .catch((e) => {
        setLoadErrorCause(e);
        setLoadError(getErrorMessage(e, 'Ошибка загрузки'));
      });
  };

  useEffect(() => {
    load();
  }, []);

  const togglePassType = (type: PassType) => {
    if (!config) return;
    const enabled = config.enabledPassTypes.includes(type);
    const next = enabled
      ? config.enabledPassTypes.filter((t) => t !== type)
      : [...config.enabledPassTypes, type];
    if (next.length === 0) {
      toast('Должен остаться хотя бы один тип пропуска', 'error');
      return;
    }
    setConfig({ ...config, enabledPassTypes: next });
  };

  const togglePermission = (role: string, permission: string) => {
    if (!config) return;
    const current = config.rolePermissions[role] || [];
    const next = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    setConfig({
      ...config,
      rolePermissions: { ...config.rolePermissions, [role]: next },
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const { config: updated } = await api.admin.updateAccessConfig({
        enabledPassTypes: config.enabledPassTypes,
        rolePermissions: config.rolePermissions,
      });
      setConfig(updated);
      await refreshUser();
      toast('Права и типы пропусков сохранены', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!hasPermission(user, 'admin.permissions')) {
    return <AdminLayout title="Права и типы пропусков"><div className="text-[var(--muted)]">Нет доступа. Только супер-администратор может менять права.</div></AdminLayout>;
  }

  if (loadError) {
    return (
      <AdminLayout title="Права и типы пропусков">
        <PageError message={loadError} error={loadErrorCause} onRetry={load} retryLabel="Повторить" />
      </AdminLayout>
    );
  }

  if (!config) {
    return <AdminLayout title="Права и типы пропусков"><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></AdminLayout>;
  }

  const groups = [...new Set(config.permissions.map((p) => p.group))];

  return (
    <AdminLayout title="Права и типы пропусков">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Настройте, какие типы пропусков доступны для заказа и какие действия разрешены каждой роли.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="card p-6 max-w-3xl">
          <h2 className="font-semibold mb-4">Типы пропусков</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Отключённые типы не появятся при заказе пропуска</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(Object.keys(config.passTypeLabels) as PassType[]).map((type) => (
              <label key={type} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-muted)]">
                <input
                  type="checkbox"
                  checked={config.enabledPassTypes.includes(type)}
                  onChange={() => togglePassType(type)}
                />
                <span className="font-medium">{config.passTypeLabels[type]}</span>
                <span className="text-xs text-[var(--muted)] ml-auto">{type}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card p-6 overflow-x-auto">
          <h2 className="font-semibold mb-4">Права по ролям</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Отметьте, что может делать каждая роль в системе</p>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium">Право</th>
                {config.roles.map((role) => (
                  <th key={role} className="text-center p-3 font-medium whitespace-nowrap">
                    {roleLabel(config, role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr className="surface-muted">
                    <td colSpan={config.roles.length + 1} className="p-2 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {group}
                    </td>
                  </tr>
                  {config.permissions.filter((p) => p.group === group).map((perm) => (
                    <tr key={perm.key} className="border-b border-[var(--border)] last:border-0">
                      <td className="p-3">{perm.label}</td>
                      {config.roles.map((role) => (
                        <td key={`${role}-${perm.key}`} className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={(config.rolePermissions[role] || []).includes(perm.key)}
                            onChange={() => togglePermission(role, perm.key)}
                            aria-label={`${perm.label} для ${role}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </form>
    </AdminLayout>
  );
}