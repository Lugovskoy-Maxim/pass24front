"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASS_TYPE_LABELS = exports.ROLE_LABELS = exports.BUILTIN_EMPLOYEE_ROLE_LABELS = exports.DEFAULT_EMPLOYEE_ROLE_PERMISSIONS = exports.BUILTIN_EMPLOYEE_ROLES = exports.BUILTIN_EMPLOYEE_ROLE = exports.SYSTEM_ROLES = exports.DEFAULT_ROLE_PERMISSIONS = exports.ALL_PERMISSIONS = exports.ALL_PASS_TYPES = void 0;
exports.ALL_PASS_TYPES = ['visitor', 'parking', 'delivery', 'contractor'];
exports.ALL_PERMISSIONS = [
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
];
exports.DEFAULT_ROLE_PERMISSIONS = {
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
    admin: exports.ALL_PERMISSIONS.map((p) => p.key),
};
exports.SYSTEM_ROLES = ['tenant', 'security', 'bc_admin', 'admin'];
exports.BUILTIN_EMPLOYEE_ROLE = 'tenant_employee';
exports.BUILTIN_EMPLOYEE_ROLES = [exports.BUILTIN_EMPLOYEE_ROLE];
exports.DEFAULT_EMPLOYEE_ROLE_PERMISSIONS = {
    [exports.BUILTIN_EMPLOYEE_ROLE]: ['passes.create', 'passes.templates', 'passes.view_own'],
};
exports.BUILTIN_EMPLOYEE_ROLE_LABELS = {
    [exports.BUILTIN_EMPLOYEE_ROLE]: 'Сотрудник компании',
};
exports.ROLE_LABELS = {
    tenant: 'Арендатор',
    security: 'Ресепшн / Охрана',
    bc_admin: 'Администратор БЦ',
    admin: 'Супер-администратор',
};
exports.PASS_TYPE_LABELS = {
    visitor: 'Посетитель',
    parking: 'Парковка',
    delivery: 'Доставка',
    contractor: 'Подрядчик',
};
//# sourceMappingURL=access.constants.js.map