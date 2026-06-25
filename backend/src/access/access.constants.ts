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
  { key: 'admin.settings', label: 'Настройки БЦ', group: 'Администрирование' },
  { key: 'admin.permissions', label: 'Права и типы пропусков', group: 'Администрирование' },
] as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant: ['passes.create', 'passes.templates'],
  security: ['passes.view_all', 'passes.approve', 'passes.reception', 'passes.lookup'],
  admin: ALL_PERMISSIONS.map((p) => p.key),
};

export const PASS_TYPE_LABELS: Record<string, string> = {
  visitor: 'Посетитель',
  parking: 'Парковка',
  delivery: 'Доставка',
  contractor: 'Подрядчик',
};