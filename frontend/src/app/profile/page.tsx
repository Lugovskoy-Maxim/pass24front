'use client';

/**
 * Профиль: данные, verify email, заявка на смену ФИО (owner),
 * управление сотрудниками (owner only): add / toggle isActive / hard delete.
 * Сотрудник всегда создаётся как tenant_employee — без выбора роли.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, Clock, Mail, Phone, Shield, User as UserIcon, UserPlus, Users } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PersonNameFields } from '@/components/PersonNameFields';
import { FormField, FormInput } from '@/components/FormField';
import { FieldErrors, hasFieldErrors, validateProfileForm } from '@/lib/form-validation';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import {
  api,
  formatTenantOffices,
  getErrorMessage,
  TenantEmployee,
} from '@/lib/api';
import {
  getUserRoleLabel,
  isTenantCompanyUser,
  isTenantEmployee,
  isTenantOwner,
} from '@/lib/permissions';
import {
  buildFullName,
  getUserNameLabels,
  PersonNameParts,
  splitFullName,
} from '@/lib/person-name';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

function ProfileInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <div className="font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [nameParts, setNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [employees, setEmployees] = useState<TenantEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [removingEmployeeId, setRemovingEmployeeId] = useState<string | null>(null);
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null);
  const [employeeNameParts, setEmployeeNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [emailVerifyStep, setEmailVerifyStep] = useState<'idle' | 'code'>('idle');
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [emailVerifyResendIn, setEmailVerifyResendIn] = useState(0);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  const tenantOwner = isTenantOwner(user);
  const tenantEmployee = isTenantEmployee(user);
  const tenantCompanyUser = isTenantCompanyUser(user);
  const pending = user?.profile_change_request;

  useEffect(() => {
    if (!user) return;
    const source = pending || user;
    setNameParts(
      pending
        ? {
            lastName: pending.last_name || '',
            firstName: pending.first_name || '',
            middleName: pending.middle_name || '',
          }
        : user.last_name || user.first_name
          ? {
              lastName: user.last_name || '',
              firstName: user.first_name || '',
              middleName: user.middle_name || '',
            }
          : splitFullName(user.full_name),
    );
    setPhone((pending?.phone ?? user.phone) || '');
    setCompany((pending?.company ?? user.company) || '');
  }, [user, pending]);

  const loadEmployees = useCallback((options?: { silent?: boolean }) => {
    if (!tenantOwner) return Promise.resolve();
    const silent = options?.silent;
    if (!silent) setEmployeesLoading(true);
    return api.getTenantEmployees()
      .then(({ employees: list }) => {
        setEmployees(list);
      })
      .catch(() => setEmployees([]))
      .finally(() => {
        if (!silent) setEmployeesLoading(false);
      });
  }, [tenantOwner]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useAutoRefresh(() => loadEmployees({ silent: true }), { enabled: tenantOwner && !employeeSaving });

  useEffect(() => {
    if (emailVerifyResendIn <= 0) return;
    const timer = window.setTimeout(() => setEmailVerifyResendIn((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [emailVerifyResendIn]);

  if (!user) return null;

  const needsEmailVerification = !!user.email && !user.email_verified;

  const currentName = user.last_name || user.first_name
    ? { lastName: user.last_name || '', firstName: user.first_name || '', middleName: user.middle_name || '' }
    : splitFullName(user.full_name);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateProfileForm(nameParts);
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;
    setSaving(true);
    try {
      await api.updateProfile({
        lastName: nameParts.lastName.trim(),
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
      });
      await refreshUser();
      toast('Изменения отправлены на подтверждение администратору', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddEmployee = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateProfileForm(employeeNameParts);
    if (!employeeEmail.trim()) errors.email = 'Укажите email';
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    setEmployeeSaving(true);
    try {
      const { employee, message } = await api.addTenantEmployee({
        email: employeeEmail.trim(),
        lastName: employeeNameParts.lastName.trim(),
        firstName: employeeNameParts.firstName.trim(),
        middleName: employeeNameParts.middleName.trim() || undefined,
        phone: employeePhone.trim() || undefined,
      });
      setEmployees((prev) => [employee, ...prev]);
      setEmployeeEmail('');
      setEmployeePhone('');
      setEmployeeNameParts({ lastName: '', firstName: '', middleName: '' });
      toast(message || 'Приглашение отправлено', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setEmployeeSaving(false);
    }
  };

  const handleResendInvite = async (id: string) => {
    setResendingInviteId(id);
    try {
      const { employee, message } = await api.resendTenantEmployeeInvite(id);
      setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...employee } : e)));
      toast(message, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось отправить приглашение'), 'error');
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleToggleEmployee = async (id: string, isActive: boolean) => {
    setTogglingEmployeeId(id);
    try {
      const { employee, message } = await api.setTenantEmployeeActive(id, isActive);
      setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...employee } : e)));
      toast(message, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  const handleRemoveEmployee = async (id: string, name: string) => {
    const ok = window.confirm(
      `Удалить сотрудника «${name}» навсегда?\n\nОтключённого сотрудника можно снова включить. Удаление необратимо — войти с этим email будет нельзя, пока не добавите заново.`,
    );
    if (!ok) return;

    setRemovingEmployeeId(id);
    try {
      await api.removeTenantEmployee(id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      toast('Сотрудник удалён', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setRemovingEmployeeId(null);
    }
  };

  const handleRequestEmailCode = async () => {
    setEmailVerifyLoading(true);
    try {
      const result = await api.requestEmailVerification();
      setEmailVerifyStep('code');
      setEmailVerifyCode('');
      setEmailVerifyResendIn(result.retryAfterSeconds || 300);
      toast(result.message, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось отправить код'), 'error');
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleConfirmEmailCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = emailVerifyCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast('Введите 6-значный код из письма', 'error');
      return;
    }
    setEmailVerifyLoading(true);
    try {
      const result = await api.confirmEmailVerification({ code });
      await refreshUser();
      setEmailVerifyStep('idle');
      setEmailVerifyCode('');
      setEmailVerifyResendIn(0);
      toast(result.message, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Неверный код'), 'error');
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelProfileRequest();
      await refreshUser();
      toast('Заявка отменена', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title mb-2">Мой профиль</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          {tenantEmployee
            ? 'Вы вошли как сотрудник компании и можете заказывать пропуска от её имени'
            : tenantOwner
              ? 'Изменения ФИО, телефона и компании вступают в силу после подтверждения администратором'
              : tenantCompanyUser
                ? 'Данные учётной записи арендатора'
                : 'Данные учётной записи. Для изменения обратитесь к администратору'}
        </p>

        {tenantOwner && pending && (
          <div className="card p-4 mb-6 border-amber-200 bg-amber-50/80">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">Ожидает подтверждения администратора</p>
                <p className="text-amber-800 mt-1">
                  Заявка от {new Date(pending.requested_at).toLocaleString('ru-RU')}
                </p>
                <p className="text-amber-800 mt-2">
                  Запрошено: <strong>{pending.full_name}</strong>
                  {pending.company ? ` · ${pending.company}` : ''}
                  {pending.phone ? ` · ${pending.phone}` : ''}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary text-xs mt-3"
                  disabled={cancelling}
                  onClick={handleCancel}
                >
                  {cancelling ? 'Отмена...' : 'Отменить заявку'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card p-6 space-y-4 mb-6">
          <ProfileInfoRow icon={UserIcon} label="ФИО" value={buildFullName(currentName)} />
          {(user.email || user.username) && (
            <ProfileInfoRow icon={Mail} label={user.email ? 'Email' : 'Логин'} value={user.email || user.username || ''} />
          )}
          {user.email && (
            <div className="flex items-start gap-3 text-sm">
              <CheckCircle2
                className={`w-4 h-4 shrink-0 mt-0.5 ${user.email_verified ? 'text-[var(--status-active)]' : 'text-[var(--muted)]'}`}
              />
              <div className="min-w-0">
                <div className="text-xs text-[var(--muted)]">Почта подтверждена</div>
                <div className={`font-medium ${user.email_verified ? 'text-[var(--status-active)]' : ''}`}>
                  {user.email_verified ? 'Да' : 'Нет'}
                </div>
              </div>
            </div>
          )}
          <ProfileInfoRow icon={Shield} label="Роль" value={getUserRoleLabel(user)} />
          {user.company && <ProfileInfoRow icon={Building2} label="Компания" value={user.company} />}
          {user.phone && <ProfileInfoRow icon={Phone} label="Телефон" value={user.phone} />}
          {user.offices?.length ? (
            <ProfileInfoRow icon={Building2} label="Офисы" value={formatTenantOffices(user.offices)} />
          ) : user.office ? (
            <ProfileInfoRow icon={Building2} label="Офис" value={`оф. ${user.office}${user.floor ? `, ${user.floor} эт.` : ''}`} />
          ) : null}
        </div>

        {needsEmailVerification && (
          <div className="card p-5 mb-6 border theme-alert-subtle space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium text-amber-950">Подтвердите email</p>
                <p className="text-sm text-amber-900/85 mt-1">
                  Адрес <strong className="break-all">{user.email}</strong> ещё не подтверждён.
                  Мы отправим 6-значный код на эту почту.
                </p>
              </div>
            </div>

            {emailVerifyStep === 'idle' ? (
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={emailVerifyLoading || emailVerifyResendIn > 0}
                onClick={() => void handleRequestEmailCode()}
              >
                {emailVerifyLoading
                  ? 'Отправка...'
                  : emailVerifyResendIn > 0
                    ? `Повтор через ${formatCountdown(emailVerifyResendIn)}`
                    : 'Подтвердить почту'}
              </button>
            ) : (
              <form onSubmit={handleConfirmEmailCode} className="space-y-3" noValidate>
                <FormField id="emailVerifyCode" label="Код из письма" required>
                  <FormInput
                    id="emailVerifyCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={emailVerifyCode}
                    onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="tracking-[0.3em] text-center text-lg font-mono max-w-[12rem]"
                  />
                </FormField>
                <p className="text-xs text-[var(--muted)]">
                  Код действует 15 минут. Проверьте папку «Спам», если письма нет.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-primary text-sm" disabled={emailVerifyLoading}>
                    {emailVerifyLoading ? 'Проверка...' : 'Подтвердить код'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={emailVerifyLoading || emailVerifyResendIn > 0}
                    onClick={() => void handleRequestEmailCode()}
                  >
                    {emailVerifyResendIn > 0
                      ? `Отправить снова через ${formatCountdown(emailVerifyResendIn)}`
                      : 'Отправить код снова'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={emailVerifyLoading}
                    onClick={() => {
                      setEmailVerifyStep('idle');
                      setEmailVerifyCode('');
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {tenantOwner ? (
          <form onSubmit={handleSubmit} className="card p-6 space-y-5" noValidate>
            <div>
              <h2 className="font-semibold mb-1">Запросить изменения</h2>
              <p className="text-sm text-[var(--muted)]">
                Email изменяется только администратором
              </p>
            </div>

            <PersonNameFields
              value={nameParts}
              labels={getUserNameLabels('tenant')}
              onChange={setNameParts}
              errors={fieldErrors}
              onClearError={clearFieldError}
            />

            <div className="form-grid-2">
              <FormField id="phone" label="Телефон">
                <FormInput id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
              </FormField>
              <FormField id="company" label="Компания">
                <FormInput id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ООО «...»" />
              </FormField>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Отправка...' : pending ? 'Обновить заявку' : 'Отправить на подтверждение'}
            </button>
          </form>
        ) : tenantEmployee ? (
          <div className="card p-5 text-sm text-[var(--muted)]">
            Изменение профиля недоступно для сотрудников компании. Обратитесь к владельцу аккаунта арендатора.
          </div>
        ) : !tenantCompanyUser ? (
          <div className="card p-5 text-sm text-[var(--muted)]">
            Редактирование профиля доступно арендаторам. Сотрудники БЦ и администраторы могут изменить данные через раздел «Пользователи» в админке.
          </div>
        ) : null}

        {tenantOwner && (
          <div className="card p-6 space-y-5 mt-6">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold">Сотрудники компании</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Укажите email — сотруднику придёт ссылка (72 часа), он сам задаст пароль.
                  Сотрудники видят все пропуска {user.company || 'компании'}.
                </p>
              </div>
            </div>

            {employeesLoading ? (
              <p className="text-sm text-[var(--muted)] animate-pulse">Загрузка...</p>
            ) : employees.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg">
                {employees.map((employee) => {
                  const pending = !!employee.invite_pending;
                  const busy =
                    removingEmployeeId === employee.id
                    || togglingEmployeeId === employee.id
                    || resendingInviteId === employee.id;
                  const statusLabel = pending
                    ? 'ожидает'
                    : employee.is_active
                      ? 'активен'
                      : 'отключён';
                  const statusClass = pending
                    ? 'bg-amber-50 text-amber-800'
                    : employee.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600';
                  return (
                    <li key={employee.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium flex flex-wrap items-center gap-2">
                          {employee.full_name}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-[var(--muted)] truncate">{employee.email}</div>
                        {employee.role_label && (
                          <div className="text-xs text-[var(--muted)] mt-0.5">{employee.role_label}</div>
                        )}
                        {pending && (
                          <div className="text-xs text-amber-800/90 mt-1">
                            Письмо с ссылкой отправлено. Действует 72 часа.
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {pending && (
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            disabled={busy}
                            onClick={() => void handleResendInvite(employee.id)}
                          >
                            {resendingInviteId === employee.id ? 'Отправка…' : 'Отправить снова'}
                          </button>
                        )}
                        {!pending && (
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            disabled={busy}
                            onClick={() => void handleToggleEmployee(employee.id, !employee.is_active)}
                          >
                            {togglingEmployeeId === employee.id
                              ? 'Сохранение...'
                              : employee.is_active
                                ? 'Отключить'
                                : 'Включить'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger text-xs"
                          disabled={busy}
                          onClick={() => void handleRemoveEmployee(employee.id, employee.full_name)}
                        >
                          {removingEmployeeId === employee.id ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">Пока нет добавленных сотрудников</p>
            )}

            <form onSubmit={handleAddEmployee} className="border-t border-[var(--border)] pt-5 space-y-4" noValidate>
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="w-4 h-4" />
                Пригласить сотрудника
              </div>
              <PersonNameFields
                value={employeeNameParts}
                labels={getUserNameLabels('tenant')}
                onChange={setEmployeeNameParts}
                errors={fieldErrors}
                onClearError={clearFieldError}
              />
              <div className="form-grid-2">
                <FormField id="employeeEmail" label="Email" required error={fieldErrors.email} hint="На этот адрес уйдёт ссылка">
                  <FormInput
                    id="employeeEmail"
                    type="email"
                    value={employeeEmail}
                    onChange={(e) => { setEmployeeEmail(e.target.value); clearFieldError('email'); }}
                    invalid={!!fieldErrors.email}
                  />
                </FormField>
                <FormField id="employeePhone" label="Телефон">
                  <FormInput
                    id="employeePhone"
                    type="tel"
                    value={employeePhone}
                    onChange={(e) => setEmployeePhone(e.target.value)}
                    placeholder="+7 900 000-00-00"
                  />
                </FormField>
              </div>
              <button type="submit" className="btn btn-primary" disabled={employeeSaving}>
                {employeeSaving ? 'Отправка…' : 'Отправить приглашение'}
              </button>
            </form>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}