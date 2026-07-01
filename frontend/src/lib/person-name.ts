import { PassType, UserRole } from './api';

export interface PersonNameParts {
  lastName: string;
  firstName: string;
  middleName: string;
}

export interface PersonNameLabels {
  lastName: string;
  firstName: string;
  middleName: string;
  sectionTitle?: string;
}

export function buildFullName(parts: Partial<PersonNameParts> & { fullName?: string }): string {
  if (parts.fullName?.trim()) return parts.fullName.trim();
  return [parts.lastName, parts.firstName, parts.middleName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

export function splitFullName(fullName?: string): PersonNameParts {
  if (!fullName?.trim()) {
    return { lastName: '', firstName: '', middleName: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    middleName: parts.slice(2).join(' '),
  };
}

export function getUserNameLabels(role: UserRole | string): PersonNameLabels {
  switch (role) {
    case 'tenant':
      return {
        sectionTitle: 'Контактное лицо арендатора',
        lastName: 'Фамилия',
        firstName: 'Имя',
        middleName: 'Отчество',
      };
    case 'security':
      return {
        sectionTitle: 'Сотрудник ресепшн / охраны',
        lastName: 'Фамилия',
        firstName: 'Имя',
        middleName: 'Отчество',
      };
    case 'bc_admin':
      return {
        sectionTitle: 'Администратор бизнес-центра',
        lastName: 'Фамилия',
        firstName: 'Имя',
        middleName: 'Отчество',
      };
    case 'admin':
      return {
        sectionTitle: 'Супер-администратор',
        lastName: 'Фамилия',
        firstName: 'Имя',
        middleName: 'Отчество',
      };
    default:
      return {
        lastName: 'Фамилия',
        firstName: 'Имя',
        middleName: 'Отчество',
      };
  }
}

export function getVisitorNameLabel(passType: PassType): string {
  switch (passType) {
    case 'visitor':
      return 'ФИО гостя';
    case 'parking':
      return 'ФИО водителя';
    case 'delivery':
      return 'ФИО курьера';
    case 'contractor':
      return 'ФИО представителя';
    default:
      return 'ФИО';
  }
}

export function isPersonNameValid(parts: PersonNameParts): boolean {
  return !!(parts.lastName.trim() && parts.firstName.trim());
}