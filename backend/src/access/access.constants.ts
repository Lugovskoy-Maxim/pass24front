export const ALL_PASS_TYPES = ['visitor', 'parking', 'delivery', 'contractor'] as const;

export const ALL_PERMISSIONS = [
  { key: 'passes.create', label: 'Заказ пропусков', group: 'Пропуска' },
  { key: 'passes.templates', label: 'Шаблоны пропусков', group: 'Пропуска' },
  { key: 'passes.view_own', label: 'Просмотр своих пропусков', group: 'Пропуска' },
  { key: 'passes.view_all', label: 'Просмотр всех пропусков', group: 'Пропуска' },
  { key: 'passes.approve', label: 'Одобрение и отклонение', group: 'Пропуска' },
  { key: 'passes.reception', label: 'Вход / выход посетителей', group: 'Ресепшн' },
  { key: 'passes.lookup', label: 'Поиск пропуска по номеру', group: 'Ресепшн' },
  { key: 'admin.panel', label: 'Панель администратора', group: 'Администрирование' },
  { key: 'admin.users', label: 'Управление пользователями', group: 'Администрирование' },
  { key: 'admin.offices', label: 'Управление офисами', group: 'Администрирование' },
  { key: 'admin.settings', label: 'Базовые настройки сайта', group: 'Администрирование' },
  { key: 'admin.permissions', label: 'Права и типы пропусков', group: 'Администрирование' },
] as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant: ['passes.create', 'passes.templates', 'passes.view_own'],
  security: ['passes.view_all', 'passes.approve', 'passes.reception', 'passes.lookup'],
  bc_admin: [
    'passes.view_all',
    'passes.approve',
    'passes.reception',
    'passes.lookup',
    'admin.panel',
    'admin.users',
    'admin.offices',
    'admin.settings',
  ],
  admin: ALL_PERMISSIONS.map((p) => p.key),
};

export const SYSTEM_ROLES = ['tenant', 'security', 'bc_admin', 'admin'] as const;

/** Встроенные роли для сотрудников арендаторов — создаются автоматически, нельзя удалить */
export const BUILTIN_EMPLOYEE_ROLE = 'tenant_employee';
export const BUILTIN_EMPLOYEE_ROLES = [BUILTIN_EMPLOYEE_ROLE] as const;

export const DEFAULT_EMPLOYEE_ROLE_PERMISSIONS: Record<string, string[]> = {
  [BUILTIN_EMPLOYEE_ROLE]: ['passes.create', 'passes.templates', 'passes.view_own'],
};

export const BUILTIN_EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  [BUILTIN_EMPLOYEE_ROLE]: 'Сотрудник компании',
};

export const ROLE_LABELS: Record<string, string> = {
  tenant: 'Арендатор',
  security: 'Ресепшн / Охрана',
  bc_admin: 'Администратор БЦ',
  admin: 'Супер-администратор',
};

export const PASS_TYPE_LABELS: Record<string, string> = {
  visitor: 'Посетитель',
  parking: 'Парковка',
  delivery: 'Доставка',
  contractor: 'Подрядчик',
};