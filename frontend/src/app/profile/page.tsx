'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Building2, Clock, Mail, Phone, Shield, User as UserIcon, UserPlus, Users } from 'lucide-react';
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
  ROLE_LABELS,
  TenantEmployee,
  TenantEmployeePosition,
} from '@/lib/api';
import {
  buildFullName,
  getUserNameLabels,
  PersonNameParts,
  splitFullName,
} from '@/lib/person-name';

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
  const [employeeNameParts, setEmployeeNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [employeePositionId, setEmployeePositionId] = useState('');
  const [positions, setPositions] = useState<TenantEmployeePosition[]>([]);

  const isTenant = user?.role === 'tenant';
  const isTenantOwner = isTenant && user?.is_tenant_owner;
  const isTenantEmployee = isTenant && !!user?.parent_tenant_id;
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

  useEffect(() => {
    if (!isTenantOwner) return;
    setEmployeesLoading(true);
    Promise.all([
      api.getTenantEmployees(),
      api.getTenantEmployeePositions(),
    ])
      .then(([{ employees: list }, { positions: posList }]) => {
        setEmployees(list.filter((e) => e.is_active));
        setPositions(posList);
        const defaultPosition = posList.find((p) => p.is_default);
        setEmployeePositionId((prev) => prev || defaultPosition?.id || posList[0]?.id || '');
      })
      .catch(() => setEmployees([]))
      .finally(() => setEmployeesLoading(false));
  }, [isTenantOwner]);

  if (!user) return null;

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
    if (!employeePassword || employeePassword.length < 6) errors.password = 'Минимум 6 символов';
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    setEmployeeSaving(true);
    try {
      const { employee } = await api.addTenantEmployee({
        email: employeeEmail.trim(),
        lastName: employeeNameParts.lastName.trim(),
        firstName: employeeNameParts.firstName.trim(),
        middleName: employeeNameParts.middleName.trim() || undefined,
        password: employeePassword,
        phone: employeePhone.trim() || undefined,
        positionId: employeePositionId || undefined,
      });
      setEmployees((prev) => [employee, ...prev]);
      setEmployeeEmail('');
      setEmployeePhone('');
      setEmployeePassword('');
      setEmployeeNameParts({ lastName: '', firstName: '', middleName: '' });
      toast('Сотрудник добавлен', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setEmployeeSaving(false);
    }
  };

  const handleRemoveEmployee = async (id: string) => {
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
          {isTenantEmployee
            ? 'Вы вошли как сотрудник компании и можете заказывать пропуска от её имени'
            : isTenantOwner
              ? 'Изменения ФИО, телефона и компании вступают в силу после подтверждения администратором'
              : isTenant
                ? 'Данные учётной записи арендатора'
                : 'Данные учётной записи. Для изменения обратитесь к администратору'}
        </p>

        {isTenant && pending && (
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
          <ProfileInfoRow icon={Shield} label="Роль" value={ROLE_LABELS[user.role]} />
          {user.company && <ProfileInfoRow icon={Building2} label="Компания" value={user.company} />}
          {user.phone && <ProfileInfoRow icon={Phone} label="Телефон" value={user.phone} />}
          {user.offices?.length ? (
            <ProfileInfoRow icon={Building2} label="Офисы" value={formatTenantOffices(user.offices)} />
          ) : user.office ? (
            <ProfileInfoRow icon={Building2} label="Офис" value={`оф. ${user.office}${user.floor ? `, ${user.floor} эт.` : ''}`} />
          ) : null}
        </div>

        {isTenantOwner ? (
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
        ) : isTenantEmployee ? (
          <div className="card p-5 text-sm text-[var(--muted)]">
            Изменение профиля недоступно для сотрудников компании. Обратитесь к владельцу аккаунта арендатора.
          </div>
        ) : !isTenant ? (
          <div className="card p-5 text-sm text-[var(--muted)]">
            Редактирование профиля доступно арендаторам. Сотрудники БЦ и администраторы могут изменить данные через раздел «Пользователи» в админке.
          </div>
        ) : null}

        {isTenantOwner && (
          <div className="card p-6 space-y-5 mt-6">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold">Сотрудники компании</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Добавленные сотрудники смогут входить в систему и заказывать пропуска от лица {user.company || 'вашей компании'}.
                </p>
              </div>
            </div>

            {employeesLoading ? (
              <p className="text-sm text-[var(--muted)] animate-pulse">Загрузка...</p>
            ) : employees.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg">
                {employees.map((employee) => (
                  <li key={employee.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{employee.full_name}</div>
                      <div className="text-[var(--muted)] truncate">{employee.email}</div>
                      {employee.position_name && (
                        <div className="text-xs text-[var(--muted)] mt-0.5">{employee.position_name}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs shrink-0"
                      disabled={removingEmployeeId === employee.id}
                      onClick={() => handleRemoveEmployee(employee.id)}
                    >
                      {removingEmployeeId === employee.id ? 'Удаление...' : 'Удалить'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">Пока нет добавленных сотрудников</p>
            )}

            <form onSubmit={handleAddEmployee} className="border-t border-[var(--border)] pt-5 space-y-4" noValidate>
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="w-4 h-4" />
                Добавить сотрудника
              </div>
              <PersonNameFields
                value={employeeNameParts}
                labels={getUserNameLabels('tenant')}
                onChange={setEmployeeNameParts}
                errors={fieldErrors}
                onClearError={clearFieldError}
              />
              <div className="form-grid-2">
                <FormField id="employeeEmail" label="Email" required error={fieldErrors.email}>
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
              <FormField id="employeePassword" label="Пароль для входа" required error={fieldErrors.password} hint="Минимум 6 символов">
                <FormInput
                  id="employeePassword"
                  type="password"
                  value={employeePassword}
                  onChange={(e) => { setEmployeePassword(e.target.value); clearFieldError('password'); }}
                  invalid={!!fieldErrors.password}
                />
              </FormField>
              {positions.length > 0 && (
                <FormField id="employeePosition" label="Должность">
                  <select
                    id="employeePosition"
                    className="form-input w-full"
                    value={employeePositionId}
                    onChange={(e) => setEmployeePositionId(e.target.value)}
                  >
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}{position.is_default ? ' (по умолчанию)' : ''}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <button type="submit" className="btn btn-primary" disabled={employeeSaving}>
                {employeeSaving ? 'Добавление...' : 'Добавить сотрудника'}
              </button>
            </form>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}