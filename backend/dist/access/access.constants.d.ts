export declare const ALL_PASS_TYPES: readonly ["visitor", "parking", "delivery", "contractor"];
export declare const ALL_PERMISSIONS: readonly [{
    readonly key: "passes.create";
    readonly label: "Заказ пропусков";
    readonly group: "Пропуска";
}, {
    readonly key: "passes.templates";
    readonly label: "Шаблоны пропусков";
    readonly group: "Пропуска";
}, {
    readonly key: "passes.view_own";
    readonly label: "Просмотр своих пропусков";
    readonly group: "Пропуска";
}, {
    readonly key: "passes.view_all";
    readonly label: "Просмотр всех пропусков";
    readonly group: "Пропуска";
}, {
    readonly key: "passes.approve";
    readonly label: "Одобрение и отклонение";
    readonly group: "Пропуска";
}, {
    readonly key: "passes.reception";
    readonly label: "Вход / выход посетителей";
    readonly group: "Ресепшн";
}, {
    readonly key: "passes.lookup";
    readonly label: "Поиск пропуска по номеру";
    readonly group: "Ресепшн";
}, {
    readonly key: "admin.panel";
    readonly label: "Панель администратора";
    readonly group: "Администрирование";
}, {
    readonly key: "admin.users";
    readonly label: "Управление пользователями";
    readonly group: "Администрирование";
}, {
    readonly key: "admin.offices";
    readonly label: "Управление офисами";
    readonly group: "Администрирование";
}, {
    readonly key: "admin.settings";
    readonly label: "Базовые настройки сайта";
    readonly group: "Администрирование";
}, {
    readonly key: "admin.permissions";
    readonly label: "Права и типы пропусков";
    readonly group: "Администрирование";
}];
export declare const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]>;
export declare const SYSTEM_ROLES: readonly ["tenant", "security", "bc_admin", "admin"];
export declare const BUILTIN_EMPLOYEE_ROLE = "tenant_employee";
export declare const BUILTIN_EMPLOYEE_ROLES: readonly ["tenant_employee"];
export declare const DEFAULT_EMPLOYEE_ROLE_PERMISSIONS: Record<string, string[]>;
export declare const BUILTIN_EMPLOYEE_ROLE_LABELS: Record<string, string>;
export declare const ROLE_LABELS: Record<string, string>;
export declare const PASS_TYPE_LABELS: Record<string, string>;
