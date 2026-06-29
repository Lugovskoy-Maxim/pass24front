'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getErrorMessage } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { PersonNameFields } from '@/components/PersonNameFields';
import { buildFullName, getUserNameLabels, isPersonNameValid, PersonNameParts } from '@/lib/person-name';

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [user, authLoading, router]);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameParts, setNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [company, setCompany] = useState('');
  const [office, setOffice] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const config = useConfig();

  if (authLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!isPersonNameValid(nameParts)) {
          setError('Укажите фамилию и имя');
          setLoading(false);
          return;
        }
        await register({
          email,
          password,
          lastName: nameParts.lastName.trim(),
          firstName: nameParts.firstName.trim(),
          middleName: nameParts.middleName.trim() || undefined,
          fullName: buildFullName(nameParts),
          company,
          office,
          floor,
        });
      }
      router.push('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Ошибка входа'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <SiteBrand config={config} size="lg" showTagline layout="column" variant="dark" />
          </div>
          {(config?.sitePhone || config?.siteEmail) && (
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm" style={{ color: 'var(--header-muted)' }}>
              {config.sitePhone && (
                <a href={`tel:${config.sitePhone}`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                  <Phone className="w-4 h-4" />
                  {config.sitePhone}
                </a>
              )}
              {config.siteEmail && (
                <a href={`mailto:${config.siteEmail}`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                  <Mail className="w-4 h-4" />
                  {config.siteEmail}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex gap-1 mb-6 p-1 surface-muted rounded">
            <button
              type="button"
              className={`flex-1 py-2 text-sm rounded transition-colors ${mode === 'login' ? 'bg-white shadow-sm font-medium text-[var(--text)]' : 'text-[var(--muted)]'}`}
              onClick={() => setMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm rounded transition-colors ${mode === 'register' ? 'bg-white shadow-sm font-medium text-[var(--text)]' : 'text-[var(--muted)]'}`}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <PersonNameFields
                  value={nameParts}
                  labels={getUserNameLabels('tenant')}
                  onChange={setNameParts}
                />
                <div>
                  <label className="label">Компания (арендатор)</label>
                  <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ООО «Название»" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Офис</label>
                    <input className="input" value={office} onChange={(e) => setOffice(e.target.value)} placeholder="401" />
                  </div>
                  <div>
                    <label className="label">Этаж</label>
                    <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="4" />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted)] space-y-1">
            <p className="font-medium text-[var(--text)]">Тестовые аккаунты:</p>
            <p>Арендатор (2 БЦ): tenant@pass24.local / tenant123</p>
            <p>Арендатор 2: tenant2@pass24.local / tenant123</p>
            <p>Ресепшн: security@pass24.local / security123</p>
            <p>Админ: admin@pass24.local / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}