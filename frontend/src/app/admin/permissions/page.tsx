'use client';

import { Fragment, useEffect, useState, FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api, AccessConfig, PassType, ROLE_LABELS, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { FormField, FormInput } from '@/components/FormField';
import { hasPermission } from '@/lib/permissions';

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function transliterateRoleKey(label: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  const slug = label
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!slug) return '';
  return /^[a-z]/.test(slug) ? slug : `role_${slug}`;
}

function roleLabel(config: AccessConfig, role: string) {
  return config.roleLabels?.[role] || ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role;
}

function isProtectedRole(config: AccessConfig, role: string) {
  return (
    (config.systemRoles || Object.keys(ROLE_LABELS)).includes(role)
    || (config.builtinEmployeeRoles || []).includes(role)
  );
}

export default function AdminPermissionsPage() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleKey, setNewRoleKey] = useState('');

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

  const handleAddRole = () => {
    if (!config) return;
    const label = newRoleLabel.trim();
    const key = (newRoleKey.trim() || transliterateRoleKey(label)).toLowerCase();

    if (!label) {
      toast('Укажите название типа пользователя', 'error');
      return;
    }
    if (!ROLE_KEY_PATTERN.test(key)) {
      toast('Код роли: латиница, цифры и _, начинается с буквы', 'error');
      return;
    }
    if (config.rolePermissions[key]) {
      toast('Тип с таким кодом уже существует', 'error');
      return;
    }

    setConfig({
      ...config,
      roles: [...config.roles, key],
      rolePermissions: { ...config.rolePermissions, [key]: [] },
      roleLabels: { ...(config.roleLabels || {}), [key]: label },
    });
    setNewRoleLabel('');
    setNewRoleKey('');
  };

  const handleRemoveRole = (role: string) => {
    if (!config || isProtectedRole(config, role)) return;
    const label = roleLabel(config, role);
    if (!window.confirm(`Удалить тип пользователя «${label}»?`)) return;

    const { [role]: _removed, ...rolePermissions } = config.rolePermissions;
    const { [role]: _label, ...roleLabels } = config.roleLabels || {};
    setConfig({
      ...config,
      roles: config.roles.filter((r) => r !== role),
      rolePermissions,
      roleLabels,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const customLabels = Object.fromEntries(
        config.roles
          .filter((role) => !isProtectedRole(config, role))
          .map((role) => [role, config.roleLabels?.[role] || role]),
      );
      const { config: updated } = await api.admin.updateAccessConfig({
        enabledPassTypes: config.enabledPassTypes,
        rolePermissions: config.rolePermissions,
        roleLabels: customLabels,
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
        Дополнительные типы пользователей можно назначать сотрудникам компаний-арендаторов.
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
          <h2 className="font-semibold mb-2">Права по ролям</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Отметьте, что может делать каждая роль. Кастомные типы доступны для назначения сотрудникам арендаторов.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
            <FormField id="newRoleLabel" label="Название типа" className="flex-1">
              <FormInput
                id="newRoleLabel"
                value={newRoleLabel}
                onChange={(e) => {
                  setNewRoleLabel(e.target.value);
                  if (!newRoleKey) setNewRoleKey(transliterateRoleKey(e.target.value));
                }}
                placeholder="Менеджер"
              />
            </FormField>
            <FormField id="newRoleKey" label="Код (латиница)" className="flex-1" hint="a-z, 0-9, _">
              <FormInput
                id="newRoleKey"
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="manager"
              />
            </FormField>
            <div className="sm:self-end">
              <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={handleAddRole}>
                <Plus className="w-4 h-4" />
                Добавить тип
              </button>
            </div>
          </div>

          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium">Право</th>
                {config.roles.map((role) => (
                  <th key={role} className="text-center p-3 font-medium whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      <span>{roleLabel(config, role)}</span>
                      {!isProtectedRole(config, role) && (
                        <button
                          type="button"
                          className="text-[var(--muted)] hover:text-red-600 p-0.5"
                          title="Удалить тип"
                          onClick={() => handleRemoveRole(role)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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