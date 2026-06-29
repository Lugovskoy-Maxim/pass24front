export interface DevTestAccount {
  label: string;
  email: string;
  password: string;
  role: 'tenant' | 'security' | 'bc_admin' | 'admin';
  fullName: string;
  company?: string;
  office?: string;
  floor?: string;
}

export const DEV_TEST_ACCOUNTS: DevTestAccount[] = [
  {
    label: 'Арендатор',
    email: 'tenant@pass24.local',
    password: 'tenant123',
    role: 'tenant',
    fullName: 'Арендатор Тестовый',
    company: 'ООО «Ромашка»',
    office: '401',
    floor: '4',
  },
  {
    label: 'Ресепшн',
    email: 'security@pass24.local',
    password: 'security123',
    role: 'security',
    fullName: 'Сотрудник охраны',
  },
  {
    label: 'Админ БЦ',
    email: 'bcadmin@pass24.local',
    password: 'bcadmin123',
    role: 'bc_admin',
    fullName: 'Администратор БЦ',
  },
  {
    label: 'Админ',
    email: 'admin@pass24.local',
    password: 'admin123',
    role: 'admin',
    fullName: 'Администратор системы',
  },
];

export const DEV_TEST_ACCOUNT_EMAILS = new Set(DEV_TEST_ACCOUNTS.map((account) => account.email));