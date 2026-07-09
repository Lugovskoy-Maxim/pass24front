'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/permissions';
import { api, getErrorMessage, UserRole } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { PersonNameFields } from '@/components/PersonNameFields';
import { FormErrorBanner, FormField, FormInput, PasswordInput } from '@/components/FormField';
import { buildFullName, getUserNameLabels, PersonNameParts } from '@/lib/person-name';
import { FieldErrors, hasFieldErrors, validateLoginRegister, validateRegistrationCode } from '@/lib/form-validation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';

interface DevQuickLoginAccount {
  label: string;
  email: string;
  password: string;
  role: UserRole;
}

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) router.replace(getHomePath(user));
  }, [user, authLoading, router]);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registerStep, setRegisterStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [nameParts, setNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [devAccounts, setDevAccounts] = useState<DevQuickLoginAccount[]>([]);
  const { login, requestRegistrationCode, confirmRegistration } = useAuth();
  const config = useConfig();
  const { theme } = useTheme();

  useEffect(() => {
    api.getDevAccounts()
      .then((result) => setDevAccounts(result.accounts))
      .catch(() => setDevAccounts([]));
  }, []);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  if (authLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </div>
    );
  }

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    setFormError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const loggedIn = await login(loginEmail, loginPassword);
      router.push(getHomePath(loggedIn));
    } catch (err) {
      setFormError(getErrorMessage(err, 'Ошибка входа'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateLoginRegister({
      mode,
      email,
      password,
      nameParts: mode === 'register' ? nameParts : undefined,
      company: mode === 'register' ? company : undefined,
    });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    if (mode === 'login') {
      await performLogin(email.trim().toLowerCase(), password);
      return;
    }

    if (registerStep === 'verify') {
      const codeErrors = validateRegistrationCode(verificationCode);
      setFieldErrors(codeErrors);
      if (hasFieldErrors(codeErrors)) return;

      setFormError('');
      setLoading(true);
      try {
        const message = await confirmRegistration(email.trim().toLowerCase(), verificationCode.trim());
        setSuccess(message);
        setInfoMessage('');
        setRegisterStep('form');
        setMode('login');
        setPassword('');
        setVerificationCode('');
        setNameParts({ lastName: '', firstName: '', middleName: '' });
        setCompany('');
        setPhone('');
        setFieldErrors({});
      } catch (err) {
        setFormError(getErrorMessage(err, 'Неверный код подтверждения'));
      } finally {
        setLoading(false);
      }
      return;
    }

    setFormError('');
    setSuccess('');
    setInfoMessage('');
    setLoading(true);
    try {
      const message = await requestRegistrationCode({
        email: email.trim().toLowerCase(),
        password,
        lastName: nameParts.lastName.trim(),
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim() || undefined,
        fullName: buildFullName(nameParts),
        company: company.trim(),
        phone: phone.trim() || undefined,
      });
      setInfoMessage(message);
      setRegisterStep('verify');
      setVerificationCode('');
      setFieldErrors({});
    } catch (err) {
      setFormError(getErrorMessage(err, 'Ошибка регистрации'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setFormError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const message = await requestRegistrationCode({
        email: email.trim().toLowerCase(),
        password,
        lastName: nameParts.lastName.trim(),
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim() || undefined,
        fullName: buildFullName(nameParts),
        company: company.trim(),
        phone: phone.trim() || undefined,
      });
      setInfoMessage(message);
      setVerificationCode('');
    } catch (err) {
      setFormError(getErrorMessage(err, 'Не удалось отправить код'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (loginEmail: string, loginPassword: string) => {
    setEmail(loginEmail);
    setPassword(loginPassword);
    void performLogin(loginEmail, loginPassword);
  };

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setRegisterStep('form');
    setVerificationCode('');
    setFormError('');
    setFieldErrors({});
    setSuccess('');
    setInfoMessage('');
  };

  const backToRegisterForm = () => {
    setRegisterStep('form');
    setVerificationCode('');
    setFormError('');
    setFieldErrors({});
    setInfoMessage('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)] relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <SiteBrand config={config} size="lg" showTagline layout="column" variant={theme === 'dark' ? 'dark' : 'light'} />
          </div>
          {(config?.sitePhone || config?.siteEmail) && (
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm" style={{ color: 'var(--header-muted)' }}>
              {config.sitePhone && (
                <a href={`tel:${config.sitePhone}`} className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{ color: 'var(--header-muted)' }}>
                  <Phone className="w-4 h-4" />
                  {config.sitePhone}
                </a>
              )}
              {config.siteEmail && (
                <a href={`mailto:${config.siteEmail}`} className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity" style={{ color: 'var(--header-muted)' }}>
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
              className={`flex-1 py-2 text-sm rounded transition-colors ${mode === 'login' ? 'bg-[var(--surface-elevated)] shadow-sm font-medium text-[var(--text)]' : 'text-[var(--muted)]'}`}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm rounded transition-colors ${mode === 'register' ? 'bg-[var(--surface-elevated)] shadow-sm font-medium text-[var(--text)]' : 'text-[var(--muted)]'}`}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && registerStep === 'form' && (
              <>
                <PersonNameFields
                  value={nameParts}
                  labels={getUserNameLabels('tenant')}
                  onChange={setNameParts}
                  errors={fieldErrors}
                  onClearError={clearFieldError}
                />
                <FormField id="company" label="Компания (арендатор)" required error={fieldErrors.company}>
                  <FormInput
                    id="company"
                    value={company}
                    onChange={(e) => { setCompany(e.target.value); clearFieldError('company'); }}
                    invalid={!!fieldErrors.company}
                    placeholder="ООО «Название»"
                  />
                </FormField>
                <FormField id="phone" label="Телефон" hint="Необязательно">
                  <FormInput
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 (999) 000-00-00"
                  />
                </FormField>
                <p className="text-xs text-[var(--muted)]">
                  На email придёт код подтверждения. После регистрации заявка отправится администратору — офис назначит он.
                </p>
              </>
            )}

            {mode === 'register' && registerStep === 'verify' && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text)]">
                  Введите 6-значный код, отправленный на <span className="font-medium">{email}</span>
                </p>
                <FormField id="verificationCode" label="Код подтверждения" required error={fieldErrors.code}>
                  <FormInput
                    id="verificationCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={verificationCode}
                    onChange={(e) => {
                      setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      clearFieldError('code');
                    }}
                    invalid={!!fieldErrors.code}
                    placeholder="000000"
                    className="tracking-[0.3em] text-center text-lg font-mono"
                  />
                </FormField>
                <p className="text-xs text-[var(--muted)]">Код действует 15 минут. Проверьте папку «Спам», если письма нет.</p>
              </div>
            )}

            {(mode === 'login' || (mode === 'register' && registerStep === 'form')) && (
              <>
                <FormField id="email" label={mode === 'login' ? 'Логин или email' : 'Email'} required error={fieldErrors.email}>
                  <FormInput
                    id="email"
                    type={mode === 'login' ? 'text' : 'email'}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    invalid={!!fieldErrors.email}
                    autoComplete={mode === 'login' ? 'username' : 'email'}
                    placeholder={mode === 'login' ? 'admin или email@example.com' : undefined}
                  />
                </FormField>
                <FormField id="password" label="Пароль" required error={fieldErrors.password} hint={mode === 'register' ? 'Минимум 6 символов' : undefined}>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    invalid={!!fieldErrors.password}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </FormField>
              </>
            )}

            {success && mode === 'login' && (
              <div className="text-sm text-[var(--status-active)] bg-[var(--status-active-soft)] px-3 py-2 rounded-md border border-[var(--status-active-border)]">
                {success}
              </div>
            )}

            {infoMessage && mode === 'register' && registerStep === 'verify' && (
              <div className="text-sm text-[var(--status-active)] bg-[var(--status-active-soft)] px-3 py-2 rounded-md border border-[var(--status-active-border)]">
                {infoMessage}
              </div>
            )}

            <FormErrorBanner message={formError} />

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading
                ? 'Загрузка...'
                : mode === 'login'
                  ? 'Войти'
                  : registerStep === 'verify'
                    ? 'Подтвердить регистрацию'
                    : 'Получить код'}
            </button>

            {mode === 'register' && registerStep === 'verify' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" className="btn btn-secondary flex-1" disabled={loading} onClick={backToRegisterForm}>
                  Изменить данные
                </button>
                <button type="button" className="btn btn-secondary flex-1" disabled={loading} onClick={() => void handleResendCode()}>
                  Отправить код снова
                </button>
              </div>
            )}
          </form>

          {devAccounts.length > 0 && mode === 'login' && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <p className="text-xs font-medium text-[var(--text)] mb-3">Быстрый вход (тестовые учётки)</p>
              <div className="grid grid-cols-2 gap-2">
                {devAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="btn btn-secondary text-xs py-2 px-2"
                    disabled={loading}
                    onClick={() => handleQuickLogin(account.email, account.password)}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}