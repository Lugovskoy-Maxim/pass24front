import { isPersonNameValid, PersonNameParts } from './person-name';
import { PassType } from './api';
import { validateVisitDate } from './local-date';

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
  nameParts?: PersonNameParts;
  company?: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (isBlank(data.email)) {
    errors.email = data.mode === 'login' ? 'Укажите логин или email' : 'Укажите email';
  } else if (data.mode !== 'login' && !isValidEmail(data.email)) {
    errors.email = 'Некорректный email';
  }

  if (isBlank(data.password)) errors.password = 'Укажите пароль';
  else if (data.password.length < 6) errors.password = 'Минимум 6 символов';

  if (data.mode === 'register') {
    if (!data.nameParts?.lastName?.trim()) errors.lastName = 'Укажите фамилию';
    if (!data.nameParts?.firstName?.trim()) errors.firstName = 'Укажите имя';
    if (isBlank(data.company)) errors.company = 'Укажите название компании';
  }

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
  passType: PassType;
  vehiclePlate: string;
  visitTimeFrom: string;
  visitTimeTo: string;
  propertyId: string;
  officeId: string;
  office: string;
  sendEmail: boolean;
  recipientEmail: string;
  tenantHasOffices: boolean;
  tenantMultiBc: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (isBlank(data.visitorName)) errors.visitorName = 'Укажите имя посетителя';

  const dateError = validateVisitDate(data.visitDate);
  if (dateError) errors.visitDate = dateError;

  const timeError = validateTimeRange(data.visitTimeFrom, data.visitTimeTo);
  if (timeError) {
    errors.visitTimeFrom = timeError;
    errors.visitTimeTo = timeError;
  }

  if (data.passType === 'parking' && isBlank(data.vehiclePlate)) {
    errors.vehiclePlate = 'Укажите гос. номер';
  }

  if (data.tenantHasOffices) {
    if (data.tenantMultiBc && !data.propertyId) errors.propertyId = 'Выберите бизнес-центр';
    if (!data.officeId) errors.officeId = 'Выберите офис';
  } else if (!data.officeId && isBlank(data.office)) {
    errors.office = 'Укажите офис назначения';
  }

  if (data.sendEmail) {
    if (isBlank(data.recipientEmail)) errors.recipientEmail = 'Укажите email получателя';
    else if (!isValidEmail(data.recipientEmail)) errors.recipientEmail = 'Некорректный email';
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