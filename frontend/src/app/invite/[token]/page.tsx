'use client';

/**
 * Публичная страница принятия приглашения сотрудника.
 * URL: /invite/{token} (из письма). Задать пароль → войти.
 */
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { FormErrorBanner, FormField, FormInput, PasswordInput } from '@/components/FormField';
import { AppVersion } from '@/components/AppVersion';
import { SiteBrand } from '@/components/SiteBrand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useConfig } from '@/hooks/useConfig';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/Toast';

export default function InviteAcceptPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const router = useRouter();
  const config = useConfig();
  const { theme } = useTheme();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<{
    email?: string;
    full_name?: string;
    company?: string;
    expires_at?: string;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fieldError, setFieldError] = useState<{ password?: string; passwordConfirm?: string }>({});

  useEffect(() => {
    if (!token) {
      setError('Некорректная ссылка');
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getInviteInfo(token)
      .then((data) => {
        setInfo(data);
        setError('');
      })
      .catch((err) => {
        setInfo(null);
        setError(getErrorMessage(err, 'Ссылка недействительна или истекла'));
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: { password?: string; passwordConfirm?: string } = {};
    if (!password || password.length < 6) errors.password = 'Минимум 6 символов';
    if (!passwordConfirm) errors.passwordConfirm = 'Повторите пароль';
    else if (passwordConfirm !== password) errors.passwordConfirm = 'Пароли не совпадают';
    setFieldError(errors);
    if (errors.password || errors.passwordConfirm) return;

    setSubmitting(true);
    setError('');
    try {
      const result = await api.acceptInvite({
        token,
        password,
        passwordConfirm,
      });
      toast(result.message, 'success');
      router.replace('/login');
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось активировать аккаунт'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)] relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <SiteBrand
              config={config}
              size="lg"
              showTagline
              layout="column"
              variant={theme === 'dark' ? 'dark' : 'light'}
            />
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h1 className="text-lg font-semibold text-[var(--text)]">Приглашение в систему</h1>

          {loading && (
            <p className="text-sm text-[var(--muted)] animate-pulse">Проверка ссылки…</p>
          )}

          {!loading && error && !info && (
            <div className="space-y-3">
              <FormErrorBanner message={error} />
              <p className="text-sm text-[var(--muted)]">
                Попросите руководителя компании отправить приглашение снова (ссылка действует 72 часа).
              </p>
              <button type="button" className="btn btn-secondary w-full" onClick={() => router.push('/login')}>
                На страницу входа
              </button>
            </div>
          )}

          {!loading && info && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="text-sm text-[var(--muted)] space-y-1">
                {info.full_name && (
                  <p>
                    Здравствуйте, <span className="font-medium text-[var(--text)]">{info.full_name}</span>
                  </p>
                )}
                {info.company && (
                  <p>
                    Компания: <span className="text-[var(--text)]">{info.company}</span>
                  </p>
                )}
                {info.email && (
                  <p className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {info.email}
                  </p>
                )}
                <p className="text-xs pt-1">Задайте пароль для входа в систему пропусков.</p>
              </div>

              <FormField id="invitePassword" label="Пароль" required error={fieldError.password} hint="Минимум 6 символов">
                <PasswordInput
                  id="invitePassword"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldError((p) => ({ ...p, password: undefined }));
                  }}
                  invalid={!!fieldError.password}
                  autoComplete="new-password"
                />
              </FormField>
              <FormField id="invitePasswordConfirm" label="Повторите пароль" required error={fieldError.passwordConfirm}>
                <PasswordInput
                  id="invitePasswordConfirm"
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    setFieldError((p) => ({ ...p, passwordConfirm: undefined }));
                  }}
                  invalid={!!fieldError.passwordConfirm}
                  autoComplete="new-password"
                />
              </FormField>

              <FormErrorBanner message={error} />

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? 'Сохранение…' : 'Активировать и войти'}
              </button>
            </form>
          )}
        </div>
        <AppVersion className="mt-6" />
      </div>
    </div>
  );
}
