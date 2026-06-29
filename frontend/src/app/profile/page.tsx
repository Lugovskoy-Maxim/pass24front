'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Clock, Mail, Building2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PersonNameFields } from '@/components/PersonNameFields';
import { FormField, FormInput } from '@/components/FormField';
import { FieldErrors, hasFieldErrors, validateProfileForm } from '@/lib/form-validation';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api, formatTenantOffices } from '@/lib/api';
import {
  buildFullName,
  getUserNameLabels,
  PersonNameParts,
  splitFullName,
} from '@/lib/person-name';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [nameParts, setNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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

  if (!user) return null;

  if (user.role !== 'tenant') {
    return (
      <ProtectedLayout>
        <div className="card p-8 text-center text-[var(--muted)]">
          Редактирование профиля доступно только арендаторам
        </div>
      </ProtectedLayout>
    );
  }

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
    <ProtectedLayout roles={['tenant']}>
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title mb-2">Мой профиль</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Изменения ФИО, телефона и компании вступают в силу после подтверждения администратором
        </p>

        {pending && (
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

        <div className="card p-5 mb-6 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <Mail className="w-4 h-4" />
            <span>{user.email}</span>
            <span className="text-xs">(изменяется только администратором)</span>
          </div>
          {user.offices?.length ? (
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Building2 className="w-4 h-4" />
              <span>{formatTenantOffices(user.offices)}</span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5" noValidate>
          <div>
            <h2 className="font-semibold mb-1">Текущие данные</h2>
            <p className="text-sm text-[var(--muted)]">
              {buildFullName(currentName)}
              {user.company ? ` · ${user.company}` : ''}
              {user.phone ? ` · ${user.phone}` : ''}
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
      </div>
    </ProtectedLayout>
  );
}