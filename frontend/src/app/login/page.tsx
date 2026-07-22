'use client';

/**
 * Вход / регистрация (email|SMS OTP) / сброс пароля.
 * mode: login | register | forgot; registerStep: form | verify.
 * SMS-вкладка зависит от config.smsRegistrationEnabled.
 * Dev: кнопки быстрых учёток из GET /auth/dev-accounts (не production).
 */
import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/permissions';
import { api, getErrorMessage, UserRole } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { PersonNameFields } from '@/components/PersonNameFields';
import { FormErrorBanner, FormField, FormInput, PasswordInput } from '@/components/FormField';
import { AppVersion } from '@/components/AppVersion';
import { buildFullName, getUserNameLabels, PersonNameParts } from '@/lib/person-name';
import {
  FieldErrors,
  hasFieldErrors,
  normalizeRuMobilePhone,
  validateLoginRegister,
  validatePasswordResetConfirm,
  validatePasswordResetRequest,
  validateRegistrationCode,
} from '@/lib/form-validation';
import { formatRuMobilePhone } from '@/lib/phone';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/Toast';

interface DevQuickLoginAccount {
  label: string;
  email: string;
  password: string;
  role: UserRole;
}

type PageMode = 'login' | 'register' | 'forgot';
type ForgotStep = 'request' | 'confirm';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  // Только внутренние пути (защита от open redirect)
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.startsWith('/login') || raw.startsWith('/invite')) return null;
  return raw;
}

function LoginPageInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));

  useEffect(() => {
    if (!authLoading && user) router.replace(nextPath || getHomePath(user));
  }, [user, authLoading, router, nextPath]);

  const [mode, setMode] = useState<PageMode>('login');
  const [registerStep, setRegisterStep] = useState<'form' | 'verify'>('form');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('request');
  const [verificationChannel, setVerificationChannel] = useState<'email' | 'phone'>('email');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [nameParts, setNameParts] = useState<PersonNameParts>({ lastName: '', firstName: '', middleName: '' });
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [devAccounts, setDevAccounts] = useState<DevQuickLoginAccount[]>([]);
  const [smsResendIn, setSmsResendIn] = useState(0);
  const [resetResendIn, setResetResendIn] = useState(0);
  const [adminContact, setAdminContact] = useState<{ phone?: string; email?: string } | null>(null);
  const { login: authLogin, requestRegistrationCode, confirmRegistration } = useAuth();
  const config = useConfig();
  const { theme } = useTheme();
  const { toast } = useToast();
  const smsRegistrationEnabled = config?.smsRegistrationEnabled !== false;
  const smsDisabledMessage = config?.smsRegistrationDisabledMessage?.trim()
    || 'Скоро функция будет работать';

  useEffect(() => {
    api.getDevAccounts()
      .then((result) => setDevAccounts(result.accounts))
      .catch(() => setDevAccounts([]));
  }, []);

  useEffect(() => {
    if (!smsRegistrationEnabled && verificationChannel === 'phone') {
      setVerificationChannel('email');
    }
  }, [smsRegistrationEnabled, verificationChannel]);

  useEffect(() => {
    if (smsResendIn <= 0) return;
    const timer = window.setTimeout(() => setSmsResendIn((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [smsResendIn]);

  useEffect(() => {
    if (resetResendIn <= 0) return;
    const timer = window.setTimeout(() => setResetResendIn((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resetResendIn]);

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
        <AppVersion />
      </div>
    );
  }

  const performLogin = async (loginValue: string, loginPassword: string) => {
    setFormError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const normalizedLogin = normalizeRuMobilePhone(loginValue) || loginValue.trim().toLowerCase();
      const loggedIn = await authLogin(normalizedLogin, loginPassword);
      router.push(nextPath || getHomePath(loggedIn));
    } catch (err) {
      setFormError(getErrorMessage(err, 'Ошибка входа'));
    } finally {
      setLoading(false);
    }
  };

  const resolveEffectiveChannel = (): 'email' | 'phone' => {
    const normalizedPhone = normalizeRuMobilePhone(phone);
    const trimmedEmail = email.trim().toLowerCase();
    if (verificationChannel === 'phone') {
      return smsRegistrationEnabled ? 'phone' : 'email';
    }
    if (normalizedPhone && !trimmedEmail && smsRegistrationEnabled) return 'phone';
    return 'email';
  };

  const handleSmsChannelClick = () => {
    if (!smsRegistrationEnabled) {
      toast(smsDisabledMessage, 'info');
      return;
    }
    setVerificationChannel('phone');
    clearFieldError('email');
  };

  const buildRegisterPayload = () => {
    const normalizedPhone = normalizeRuMobilePhone(phone) || undefined;
    const trimmedEmail = email.trim().toLowerCase() || undefined;
    const channel = resolveEffectiveChannel();

    const payload: {
      email?: string;
      phone?: string;
      verificationChannel: 'email' | 'phone';
      password: string;
      passwordConfirm: string;
      lastName: string;
      firstName: string;
      middleName?: string;
      fullName: string;
      company: string;
    } = {
      verificationChannel: channel,
      password,
      passwordConfirm,
      lastName: nameParts.lastName.trim(),
      firstName: nameParts.firstName.trim(),
      middleName: nameParts.middleName.trim() || undefined,
      fullName: buildFullName(nameParts),
      company: company.trim(),
    };

    if (channel === 'phone') {
      payload.phone = normalizedPhone;
      if (trimmedEmail) payload.email = trimmedEmail;
    } else {
      payload.email = trimmedEmail;
      if (normalizedPhone) payload.phone = normalizedPhone;
    }

    return payload;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (mode === 'forgot') {
      await handleForgotSubmit();
      return;
    }

    const effectiveChannel = mode === 'register' ? resolveEffectiveChannel() : undefined;
    const errors = validateLoginRegister({
      mode: mode === 'register' ? 'register' : 'login',
      email: mode === 'login' ? login : email,
      password,
      passwordConfirm: mode === 'register' ? passwordConfirm : undefined,
      nameParts: mode === 'register' ? nameParts : undefined,
      company: mode === 'register' ? company : undefined,
      phone: mode === 'register' ? phone : undefined,
      verificationChannel: effectiveChannel,
    });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    if (mode === 'register' && effectiveChannel === 'phone' && !smsRegistrationEnabled) {
      toast(smsDisabledMessage, 'info');
      return;
    }

    if (mode === 'login') {
      await performLogin(login, password);
      return;
    }

    if (registerStep === 'verify') {
      const codeErrors = validateRegistrationCode(verificationCode, verificationChannel);
      setFieldErrors(codeErrors);
      if (hasFieldErrors(codeErrors)) return;

      setFormError('');
      setLoading(true);
      try {
        const confirmPayload = verificationChannel === 'phone'
          ? { phone: verifiedPhone, code: verificationCode.trim() }
          : { email: email.trim().toLowerCase(), code: verificationCode.trim() };
        const message = await confirmRegistration(confirmPayload);
        setSuccess(message);
        setInfoMessage('');
        setRegisterStep('form');
        setMode('login');
        setPassword('');
        setPasswordConfirm('');
        setVerificationCode('');
        setNameParts({ lastName: '', firstName: '', middleName: '' });
        setCompany('');
        setPhone('');
        setVerifiedPhone('');
        setEmail('');
        setSmsResendIn(0);
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
      const payload = buildRegisterPayload();
      const result = await requestRegistrationCode(payload);
      setInfoMessage(result.message);
      setVerificationChannel(result.verificationChannel || payload.verificationChannel);
      if (result.verificationChannel === 'phone') {
        setVerifiedPhone(payload.phone || '');
        setSmsResendIn(result.retryAfterSeconds || 300);
      } else {
        setSmsResendIn(0);
      }
      setRegisterStep('verify');
      setVerificationCode('');
      setFieldErrors({});
    } catch (err) {
      setFormError(getErrorMessage(err, 'Ошибка регистрации'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (forgotStep === 'request') {
      const errors = validatePasswordResetRequest(resetEmail);
      setFieldErrors(errors);
      if (hasFieldErrors(errors)) return;

      setFormError('');
      setInfoMessage('');
      setLoading(true);
      try {
        const result = await api.requestPasswordReset({ email: resetEmail.trim().toLowerCase() });
        setAdminContact(result.contact || {
          phone: config?.sitePhone,
          email: config?.siteEmail,
        });
        setInfoMessage(result.message);
        if (result.recoveryChannel === 'email') {
          setForgotStep('confirm');
          setResetResendIn(result.retryAfterSeconds || 300);
          setVerificationCode('');
          setPassword('');
          setPasswordConfirm('');
        }
        setFieldErrors({});
      } catch (err) {
        setFormError(getErrorMessage(err, 'Не удалось запросить восстановление'));
      } finally {
        setLoading(false);
      }
      return;
    }

    const errors = validatePasswordResetConfirm({
      code: verificationCode,
      password,
      passwordConfirm,
    });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    setFormError('');
    setLoading(true);
    try {
      const result = await api.confirmPasswordReset({
        email: resetEmail.trim().toLowerCase(),
        code: verificationCode.trim(),
        password,
        passwordConfirm,
      });
      setSuccess(result.message);
      setInfoMessage('');
      setMode('login');
      setForgotStep('request');
      setPassword('');
      setPasswordConfirm('');
      setVerificationCode('');
      setResetEmail('');
      setResetResendIn(0);
      setFieldErrors({});
    } catch (err) {
      setFormError(getErrorMessage(err, 'Не удалось сменить пароль'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (smsResendIn > 0) return;
    setFormError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await requestRegistrationCode(buildRegisterPayload());
      setInfoMessage(result.message);
      setVerificationCode('');
      if (result.verificationChannel === 'phone') {
        setSmsResendIn(result.retryAfterSeconds || 300);
      }
    } catch (err) {
      setFormError(getErrorMessage(err, 'Не удалось отправить код'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (resetResendIn > 0) return;
    setFormError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await api.requestPasswordReset({ email: resetEmail.trim().toLowerCase() });
      setInfoMessage(result.message);
      setAdminContact(result.contact || adminContact);
      if (result.recoveryChannel === 'email') {
        setResetResendIn(result.retryAfterSeconds || 300);
      }
      setVerificationCode('');
    } catch (err) {
      setFormError(getErrorMessage(err, 'Не удалось отправить код'));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneBlur = () => {
    const normalized = normalizeRuMobilePhone(phone);
    if (normalized) setPhone(formatRuMobilePhone(normalized));
  };

  const handleQuickLogin = (loginEmail: string, loginPassword: string) => {
    setLogin(loginEmail);
    setPassword(loginPassword);
    void performLogin(loginEmail, loginPassword);
  };

  const switchMode = (next: PageMode) => {
    setMode(next);
    setRegisterStep('form');
    setForgotStep('request');
    setVerificationCode('');
    setFormError('');
    setFieldErrors({});
    setSuccess('');
    setInfoMessage('');
    setPasswordConfirm('');
    setSmsResendIn(0);
    setResetResendIn(0);
    if (next === 'forgot') {
      setResetEmail(login.includes('@') ? login : email);
      setAdminContact({
        phone: config?.sitePhone,
        email: config?.siteEmail,
      });
    }
  };

  const backToRegisterForm = () => {
    setRegisterStep('form');
    setVerificationCode('');
    setFormError('');
    setFieldErrors({});
    setInfoMessage('');
  };

  const verificationTarget = verificationChannel === 'phone'
    ? formatRuMobilePhone(verifiedPhone || phone)
    : email;

  const contactPhone = adminContact?.phone || config?.sitePhone;
  const contactEmail = adminContact?.email || config?.siteEmail;

  const submitLabel = (() => {
    if (loading) return 'Загрузка...';
    if (mode === 'login') return 'Войти';
    if (mode === 'forgot') {
      return forgotStep === 'confirm' ? 'Сохранить новый пароль' : 'Отправить код';
    }
    if (registerStep === 'verify') return 'Подтвердить регистрацию';
    return 'Получить код';
  })();

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
          {mode !== 'forgot' && (
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
          )}

          {mode === 'forgot' && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[var(--text)]">Восстановление пароля</h2>
              <p className="text-sm text-[var(--muted)] mt-1">
                Код придёт на email, привязанный к аккаунту. Если почты нет — обратитесь к администратору.
              </p>
            </div>
          )}

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

                <div className="space-y-2">
                  <p className="text-sm font-medium text-[var(--text)]">Подтверждение регистрации</p>
                  <div className="channel-tabs">
                    <button
                      type="button"
                      className={`channel-tabs__btn ${verificationChannel === 'email' ? 'channel-tabs__btn--active' : ''}`}
                      onClick={() => { setVerificationChannel('email'); clearFieldError('phone'); }}
                    >
                      По email
                    </button>
                    <button
                      type="button"
                      className={[
                        'channel-tabs__btn',
                        verificationChannel === 'phone' ? 'channel-tabs__btn--active' : '',
                        !smsRegistrationEnabled ? 'channel-tabs__btn--disabled' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={handleSmsChannelClick}
                      aria-disabled={!smsRegistrationEnabled}
                    >
                      По SMS
                    </button>
                  </div>
                </div>

                {verificationChannel === 'email' ? (
                  <>
                    <FormField id="email" label="Email" required error={fieldErrors.email}>
                      <FormInput
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                        invalid={!!fieldErrors.email}
                        autoComplete="email"
                      />
                    </FormField>
                    <FormField id="phone" label="Телефон" error={fieldErrors.phone}>
                      <FormInput
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
                        onBlur={handlePhoneBlur}
                        invalid={!!fieldErrors.phone}
                        placeholder="+7 (999) 000-00-00"
                      />
                    </FormField>
                  </>
                ) : (
                  <>
                    <FormField id="phone" label="Телефон" required error={fieldErrors.phone}>
                      <FormInput
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
                        onBlur={handlePhoneBlur}
                        invalid={!!fieldErrors.phone}
                        placeholder="+7 (999) 000-00-00"
                      />
                    </FormField>
                    <FormField id="email" label="Email" hint="Необязательно" error={fieldErrors.email}>
                      <FormInput
                        id="email"
                        type="text"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                        invalid={!!fieldErrors.email}
                        autoComplete="email"
                      />
                    </FormField>
                  </>
                )}
              </>
            )}

            {mode === 'register' && registerStep === 'verify' && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text)]">
                  Введите 6-значный код, отправленный на{' '}
                  <span className="font-medium">{verificationTarget}</span>
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
                <p className="text-xs text-[var(--muted)]">
                  Код действует 15 минут.
                  {verificationChannel === 'email'
                    ? ' Проверьте папку «Спам», если письма нет.'
                    : ' Повторная отправка SMS — не чаще 1 раза в 5 минут.'}
                </p>
              </div>
            )}

            {mode === 'login' && (
              <>
                <FormField id="login" label="Логин, email или телефон" required error={fieldErrors.email}>
                  <FormInput
                    id="login"
                    type="text"
                    value={login}
                    onChange={(e) => { setLogin(e.target.value); clearFieldError('email'); }}
                    onBlur={() => {
                      const normalized = normalizeRuMobilePhone(login);
                      if (normalized) setLogin(formatRuMobilePhone(normalized));
                    }}
                    invalid={!!fieldErrors.email}
                    autoComplete="username"
                    placeholder="admin, email@example.com или +7 (999) 000-00-00"
                  />
                </FormField>
                <FormField id="password" label="Пароль" required error={fieldErrors.password}>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    invalid={!!fieldErrors.password}
                    autoComplete="current-password"
                  />
                </FormField>
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-sm text-[var(--primary)] hover:underline"
                    onClick={() => switchMode('forgot')}
                  >
                    Забыли пароль?
                  </button>
                </div>
              </>
            )}

            {mode === 'register' && registerStep === 'form' && (
              <>
                <FormField id="password" label="Пароль" required error={fieldErrors.password} hint="Минимум 6 символов">
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    invalid={!!fieldErrors.password}
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField id="passwordConfirm" label="Повторите пароль" required error={fieldErrors.passwordConfirm}>
                  <PasswordInput
                    id="passwordConfirm"
                    value={passwordConfirm}
                    onChange={(e) => { setPasswordConfirm(e.target.value); clearFieldError('passwordConfirm'); }}
                    invalid={!!fieldErrors.passwordConfirm}
                    autoComplete="new-password"
                  />
                </FormField>
              </>
            )}

            {mode === 'forgot' && forgotStep === 'request' && (
              <FormField id="resetEmail" label="Email аккаунта" required error={fieldErrors.email}>
                <FormInput
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => { setResetEmail(e.target.value); clearFieldError('email'); }}
                  invalid={!!fieldErrors.email}
                  autoComplete="email"
                  placeholder="email@example.com"
                />
              </FormField>
            )}

            {mode === 'forgot' && forgotStep === 'confirm' && (
              <>
                <p className="text-sm text-[var(--text)]">
                  Введите код из письма на <span className="font-medium">{resetEmail}</span> и новый пароль.
                </p>
                <FormField id="resetCode" label="Код из письма" required error={fieldErrors.code}>
                  <FormInput
                    id="resetCode"
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
                <FormField id="newPassword" label="Новый пароль" required error={fieldErrors.password} hint="Минимум 6 символов">
                  <PasswordInput
                    id="newPassword"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    invalid={!!fieldErrors.password}
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField id="newPasswordConfirm" label="Повторите пароль" required error={fieldErrors.passwordConfirm}>
                  <PasswordInput
                    id="newPasswordConfirm"
                    value={passwordConfirm}
                    onChange={(e) => { setPasswordConfirm(e.target.value); clearFieldError('passwordConfirm'); }}
                    invalid={!!fieldErrors.passwordConfirm}
                    autoComplete="new-password"
                  />
                </FormField>
              </>
            )}

            {success && mode === 'login' && (
              <div className="text-sm text-[var(--status-active)] bg-[var(--status-active-soft)] px-3 py-2 rounded-md border border-[var(--status-active-border)]">
                {success}
              </div>
            )}

            {infoMessage && (mode === 'register' || mode === 'forgot') && (
              <div className="text-sm text-[var(--status-active)] bg-[var(--status-active-soft)] px-3 py-2 rounded-md border border-[var(--status-active-border)]">
                {infoMessage}
              </div>
            )}

            {mode === 'forgot' && (contactPhone || contactEmail) && (
              <div className="text-sm text-[var(--muted)] bg-[var(--surface-muted)] px-3 py-2 rounded-md border border-[var(--border)] space-y-1">
                <p className="font-medium text-[var(--text)]">Связаться с администратором</p>
                {contactPhone && (
                  <a href={`tel:${contactPhone}`} className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline">
                    <Phone className="w-3.5 h-3.5" />
                    {contactPhone}
                  </a>
                )}
                {contactEmail && (
                  <div>
                    <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline">
                      <Mail className="w-3.5 h-3.5" />
                      {contactEmail}
                    </a>
                  </div>
                )}
              </div>
            )}

            <FormErrorBanner message={formError} />

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {submitLabel}
            </button>

            {mode === 'register' && registerStep === 'verify' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" className="btn btn-secondary flex-1" disabled={loading} onClick={backToRegisterForm}>
                  Изменить данные
                </button>
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  disabled={loading || (verificationChannel === 'phone' && smsResendIn > 0)}
                  onClick={() => void handleResendCode()}
                >
                  {verificationChannel === 'phone' && smsResendIn > 0
                    ? `Повтор через ${formatCountdown(smsResendIn)}`
                    : 'Отправить код снова'}
                </button>
              </div>
            )}

            {mode === 'forgot' && forgotStep === 'confirm' && (
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={loading || resetResendIn > 0}
                onClick={() => void handleResendResetCode()}
              >
                {resetResendIn > 0
                  ? `Повторная отправка через ${formatCountdown(resetResendIn)}`
                  : 'Отправить код снова'}
              </button>
            )}

            {mode === 'forgot' && (
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={loading}
                onClick={() => switchMode('login')}
              >
                Вернуться ко входу
              </button>
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
        <AppVersion className="mt-6" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen flex flex-col items-center justify-center gap-3">
          <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
          <AppVersion />
        </div>
      )}
    >
      <LoginPageInner />
    </Suspense>
  );
}
