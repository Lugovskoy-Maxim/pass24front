import { isPersonNameValid, PersonNameParts } from './person-name';
import { PassType } from './api';
import { validateBookableVisitDate } from './bookable-visit-dates';
import { isValidRuMobilePhone, looksLikePhoneInput, normalizeRuMobilePhone } from './phone';
import {
  isAllowedRegistrationEmail,
  REGISTRATION_EMAIL_POLICY_MESSAGE,
} from './email-policy';

export type FieldErrors = Record<string, string | undefined>;

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function firstFieldError(errors: FieldErrors): string | undefined {
  return Object.values(errors).find(Boolean);
}

export function isBlank(value?: string | null): boolean {
  return !value || !value.trim();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validateTimeRange(from: string, to: string): string | undefined {
  if (!from || !to) return undefined;
  if (from >= to) return 'Время «С» должно быть раньше времени «До»';
  return undefined;
}

export function validateLoginRegister(data: {
  mode: 'login' | 'register';
  email: string;
  password: string;
  passwordConfirm?: string;
  nameParts?: PersonNameParts;
  company?: string;
  phone?: string;
  verificationChannel?: 'email' | 'phone';
  /** Запрещённые домены из /api/config (админка). null/undefined — дефолтный список. */
  blockedEmailDomains?: string[] | null;
}): FieldErrors {
  const errors: FieldErrors = {};
  const emailOpts = { blockedDomains: data.blockedEmailDomains };

  if (data.mode === 'login') {
    if (isBlank(data.email)) {
      errors.email = 'Укажите логин, email или телефон';
    } else if (looksLikePhoneInput(data.email) && !isValidRuMobilePhone(data.email)) {
      errors.email = 'Некорректный телефон. Формат: +7 9XX XXX-XX-XX';
    }
  } else if (data.verificationChannel === 'phone') {
    if (isBlank(data.phone)) {
      errors.phone = 'Укажите номер телефона';
    } else if (!isValidRuMobilePhone(data.phone)) {
      errors.phone = 'Некорректный телефон. Формат: +7 9XX XXX-XX-XX';
    }
    if (!isBlank(data.email)) {
      if (!isValidEmail(data.email)) errors.email = 'Проверьте формат email (name@company.ru)';
      else if (!isAllowedRegistrationEmail(data.email, emailOpts)) errors.email = REGISTRATION_EMAIL_POLICY_MESSAGE;
    }
  } else {
    if (isBlank(data.email)) errors.email = 'Укажите email';
    else if (!isValidEmail(data.email)) errors.email = 'Проверьте формат email (name@company.ru)';
    else if (data.mode === 'register' && !isAllowedRegistrationEmail(data.email, emailOpts)) {
      errors.email = REGISTRATION_EMAIL_POLICY_MESSAGE;
    }
    if (!isBlank(data.phone) && !isValidRuMobilePhone(data.phone)) {
      errors.phone = 'Некорректный телефон. Формат: +7 9XX XXX-XX-XX';
    }
  }

  if (isBlank(data.password)) errors.password = 'Укажите пароль';
  else if (data.password.length < 6) errors.password = 'Пароль не короче 6 символов';

  if (data.mode === 'register') {
    if (isBlank(data.passwordConfirm)) errors.passwordConfirm = 'Повторите пароль';
    else if (data.passwordConfirm !== data.password) errors.passwordConfirm = 'Пароли не совпадают';
    if (!data.nameParts?.lastName?.trim()) errors.lastName = 'Укажите фамилию';
    if (!data.nameParts?.firstName?.trim()) errors.firstName = 'Укажите имя';
    if (isBlank(data.company)) errors.company = 'Укажите название компании';
  }

  return errors;
}

export function validatePasswordResetRequest(email: string): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(email)) errors.email = 'Укажите email, указанный при регистрации';
  else if (!isValidEmail(email)) errors.email = 'Проверьте формат email';
  return errors;
}

export function validatePasswordResetConfirm(data: {
  code: string;
  password: string;
  passwordConfirm: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = data.code.trim();
  if (!trimmed) errors.code = 'Введите код из письма';
  else if (!/^\d{6}$/.test(trimmed)) errors.code = 'Код — 6 цифр без пробелов';
  if (isBlank(data.password)) errors.password = 'Укажите новый пароль';
  else if (data.password.length < 6) errors.password = 'Пароль не короче 6 символов';
  if (isBlank(data.passwordConfirm)) errors.passwordConfirm = 'Повторите новый пароль';
  else if (data.passwordConfirm !== data.password) errors.passwordConfirm = 'Пароли не совпадают';
  return errors;
}

export function validateRegistrationCode(code: string, channel: 'email' | 'phone' = 'email'): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = code.trim();
  if (!trimmed) errors.code = channel === 'phone' ? 'Введите код из SMS' : 'Введите код из письма';
  else if (!/^\d{6}$/.test(trimmed)) errors.code = 'Код — 6 цифр без пробелов';
  return errors;
}

export function validateProfileForm(nameParts: PersonNameParts): FieldErrors {
  const errors: FieldErrors = {};
  if (!isPersonNameValid(nameParts)) {
    if (!nameParts.lastName.trim()) errors.lastName = 'Укажите фамилию';
    if (!nameParts.firstName.trim()) errors.firstName = 'Укажите имя';
  }
  return errors;
}

export function validateNewPassForm(data: {
  visitorName: string;
  visitDate: string;
  bookableDates: string[];
  passType: PassType;
  vehiclePlate: string;
  propertyId: string;
  officeId: string;
  office: string;
  sendEmail: boolean;
  recipientEmail: string;
  tenantHasOffices: boolean;
  tenantMultiBc: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (isBlank(data.visitorName)) errors.visitorName = 'Укажите ФИО или имя посетителя';

  const dateError = validateBookableVisitDate(data.visitDate, data.bookableDates);
  if (dateError) errors.visitDate = dateError;

  if (data.passType === 'parking' && isBlank(data.vehiclePlate)) {
    errors.vehiclePlate = 'Укажите государственный номер автомобиля';
  }

  if (data.tenantHasOffices) {
    if (data.tenantMultiBc && !data.propertyId) errors.propertyId = 'Выберите бизнес-центр';
    if (!data.officeId) errors.officeId = 'Выберите офис из списка';
  } else if (!data.officeId && isBlank(data.office)) {
    errors.office = 'Укажите офис назначения';
  }

  if (data.sendEmail) {
    if (isBlank(data.recipientEmail)) errors.recipientEmail = 'Укажите email, куда отправить пропуск';
    else if (!isValidEmail(data.recipientEmail)) errors.recipientEmail = 'Проверьте формат email получателя';
  }

  return errors;
}

export function validatePassTemplateForm(data: {
  name: string;
  visitorName: string;
  passType: PassType;
  vehiclePlate?: string;
  officeId: string;
  office: string;
  tenantHasOffices: boolean;
  visitorLabel: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (isBlank(data.name)) errors.name = 'Укажите название шаблона';
  if (isBlank(data.visitorName)) errors.visitorName = `Укажите ${data.visitorLabel.toLowerCase()}`;
  if (data.passType === 'parking' && isBlank(data.vehiclePlate)) {
    errors.vehiclePlate = 'Укажите гос. номер';
  }
  if (data.tenantHasOffices) {
    if (!data.officeId) errors.officeId = 'Выберите офис';
  } else if (isBlank(data.office)) {
    errors.office = 'Укажите офис';
  }

  return errors;
}

export { normalizeRuMobilePhone };