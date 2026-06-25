const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

export type UserRole = 'tenant' | 'security' | 'bc_admin' | 'admin';

export const VISIT_PURPOSES = ['Гость', 'Встреча', 'Доставка', 'Рабочий', 'Сотрудник'] as const;

export function getPassTicketUrl(passNumber: string) {
  if (typeof window === 'undefined') return `/ticket/${encodeURIComponent(passNumber)}`;
  return `${window.location.origin}/ticket/${encodeURIComponent(passNumber)}`;
}

export interface TenantOffice {
  id: string;
  propertyId: string;
  businessCenterName?: string;
  number: string;
  floor: string;
  company?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  company?: string;
  role: UserRole;
  office?: string;
  floor?: string;
  offices?: TenantOffice[];
  permissions?: string[];
  enabledPassTypes?: PassType[];
}

export interface PermissionMeta {
  key: string;
  label: string;
  group: string;
}

export interface AccessConfig {
  enabledPassTypes: PassType[];
  rolePermissions: Record<string, string[]>;
  permissions: PermissionMeta[];
  passTypeLabels: Record<PassType, string>;
  roleLabels?: Record<string, string>;
  roles: string[];
}

export type PassStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'expired' | 'cancelled';
export type PassType = 'visitor' | 'parking' | 'delivery' | 'contractor';

export interface PassTimelineData {
  status: PassStatus;
  createdAt?: string;
  approvedAt?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  rejectionReason?: string;
}

export interface PublicPassTicket extends PassTimelineData {
  passNumber: string;
  visitorName: string;
  companyName?: string;
  visitPurpose?: string;
  passType: PassType;
  vehiclePlate?: string;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  businessCenterName?: string;
  office: string;
  floor?: string;
}

export interface Pass {
  id: string;
  passNumber: string;
  isOwner?: boolean;
  createdBy?: string;
  creatorName?: string;
  creatorCompany?: string;
  visitorName: string;
  visitorPhone?: string;
  companyName?: string;
  visitPurpose?: string;
  passType: PassType;
  vehiclePlate?: string;
  vehicleModel?: string;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  propertyId?: string;
  officeId?: string;
  businessCenterName?: string;
  office: string;
  floor?: string;
  comment?: string;
  status: PassStatus;
  approvedBy?: string;
  approverName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  checkerInName?: string;
  checkedOutAt?: string;
  checkedOutBy?: string;
  checkerOutName?: string;
  createdAt: string;
  updatedAt: string;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pass24_token');
}

function parseContentDispositionFilename(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return fallback;
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}

async function downloadFileResponse(res: Response, fallbackName: string) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Ошибка выгрузки');
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error('Получен пустой файл');
  }

  const filename = parseContentDispositionFilename(
    res.headers.get('Content-Disposition'),
    fallbackName,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('pass24_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error(data.message || data.error || 'Ошибка запроса');
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: { email: string; password: string; fullName: string; phone?: string; company?: string; office?: string; floor?: string }) =>
    request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  getPasses: (params?: { status?: string; date?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.date) q.set('date', params.date);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<{ passes: Pass[] }>(`/passes${qs ? `?${qs}` : ''}`);
  },

  getJournal: (date?: string) =>
    request<{ date: string; stats: { total: number; pending: number; active: number; completed: number; approved: number }; passes: Pass[] }>(
      `/passes/journal${date ? `?date=${date}` : ''}`,
    ),

  getPass: (id: string) => request<{ pass: Pass }>(`/passes/${id}`),

  createPass: (data: {
    visitorName: string;
    visitorPhone?: string;
    companyName?: string;
    visitPurpose?: string;
    passType: PassType;
    vehiclePlate?: string;
    vehicleModel?: string;
    visitDate: string;
    visitTimeFrom?: string;
    visitTimeTo?: string;
    officeId?: string;
    office?: string;
    floor?: string;
    comment?: string;
    sendEmail?: boolean;
    recipientEmail?: string;
  }) =>
    request<{ pass: Pass; emailSent?: boolean }>('/passes', { method: 'POST', body: JSON.stringify(data) }),

  sendPassEmail: (passIdOrNumber: string, email: string) =>
    request<{ sent: boolean; email: string }>(`/passes/${encodeURIComponent(passIdOrNumber)}/send-email`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  updateStatus: (id: string, status: string, rejectionReason?: string) =>
    request<{ pass: Pass }>(`/passes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason }),
    }),

  checkIn: (id: string) =>
    request<{ pass: Pass }>(`/passes/${id}/check-in`, { method: 'POST' }),

  checkOut: (id: string) =>
    request<{ pass: Pass }>(`/passes/${id}/check-out`, { method: 'POST' }),

  getConfig: () => request<BcConfig>('/config'),

  getAccessConfig: () => request<{
    enabledPassTypes: PassType[];
    passTypeLabels: Record<PassType, string>;
    permissions: string[];
    rolePermissions: Record<string, string[]>;
  }>('/config/access'),

  getStats: () => request<PassStats>('/passes/stats'),

  lookupPass: (passNumber: string) =>
    request<{ pass: Pass }>(`/passes/lookup/${encodeURIComponent(passNumber)}`),

  getPublicTicket: async (passNumber: string) => {
    const res = await fetch(`${API_URL}/passes/public/${encodeURIComponent(passNumber)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Пропуск не найден');
    }
    return data as { ticket: PublicPassTicket };
  },

  getPassTemplates: () => request<{ templates: PassTemplate[] }>('/pass-templates'),

  getPassTemplate: (id: string) => request<{ template: PassTemplate }>(`/pass-templates/${id}`),

  createPassTemplate: (data: CreatePassTemplateData) =>
    request<{ template: PassTemplate }>('/pass-templates', { method: 'POST', body: JSON.stringify(data) }),

  updatePassTemplate: (id: string, data: Partial<CreatePassTemplateData>) =>
    request<{ template: PassTemplate }>(`/pass-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deletePassTemplate: (id: string) =>
    request<{ ok: boolean }>(`/pass-templates/${id}`, { method: 'DELETE' }),

  syncPassTemplates: () =>
    request<{ templates: PassTemplate[]; imported: number }>('/pass-templates/sync-from-passes', { method: 'POST' }),

  admin: {
    dashboard: () => request<AdminDashboard>('/admin/dashboard'),

    getUsers: (params: UserFilters = {}) => {
      const q = new URLSearchParams();
      if (params.category) q.set('category', params.category);
      if (params.role) q.set('role', params.role);
      if (params.search) q.set('search', params.search);
      if (params.isActive) q.set('isActive', params.isActive);
      if (params.propertyId) q.set('propertyId', params.propertyId);
      if (params.officeId) q.set('officeId', params.officeId);
      const qs = q.toString();
      return request<{ users: AdminUser[]; total: number; counts: { tenants: number; staff: number } }>(
        `/admin/users${qs ? `?${qs}` : ''}`,
      );
    },

    createUser: (data: CreateUserData) =>
      request<{ user: AdminUser }>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),

    updateUser: (id: string, data: Partial<CreateUserData & { isActive: boolean }>) =>
      request<{ user: AdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    getBusinessCenters: () => request<{ businessCenters: BusinessCenter[] }>('/admin/business-centers'),

    createBusinessCenter: (data: { name: string; address: string; code?: string }) =>
      request<{ businessCenter: BusinessCenter }>('/admin/business-centers', { method: 'POST', body: JSON.stringify(data) }),

    updateBusinessCenter: (id: string, data: { name?: string; address?: string }) =>
      request<{ businessCenter: BusinessCenter }>(`/admin/business-centers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    seedTestData: () =>
      request<{ message: string; businessCenters: number; offices: number; tenants: number; skipped: boolean }>(
        '/admin/seed-test-data',
        { method: 'POST' },
      ),

    getAccessConfig: () => request<AccessConfig>('/admin/access-config'),

    updateAccessConfig: (data: Partial<Pick<AccessConfig, 'enabledPassTypes' | 'rolePermissions'>>) =>
      request<{ config: AccessConfig }>('/admin/access-config', { method: 'PATCH', body: JSON.stringify(data) }),

    getAudit: (filters: AuditFilters = {}) => {
      const qs = buildAuditQuery(filters);
      return request<{ entries: AuditEntry[]; total: number; offset: number; limit: number }>(
        `/admin/audit${qs ? `?${qs}` : ''}`,
      );
    },

    exportAudit: async (filters: AuditFilters = {}) => {
      const qs = buildAuditQuery({ ...filters, offset: undefined });
      const token = getToken();
      const datePart = filters.dateFrom && filters.dateTo
        ? `${filters.dateFrom}_${filters.dateTo}`
        : new Date().toISOString().slice(0, 10);
      const res = await fetch(`${API_URL}/admin/audit/export${qs ? `?${qs}` : ''}`, {
        headers: {
          Accept: 'text/csv',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      await downloadFileResponse(res, `audit-${datePart}.csv`);
    },

    getSiteSettings: () => request<{ settings: SiteSettings }>('/admin/site-settings'),

    updateSiteSettings: (data: Partial<SiteSettings>) =>
      request<{ settings: SiteSettings }>('/admin/site-settings', { method: 'PATCH', body: JSON.stringify(data) }),

    getSettings: () => request<{ settings: SystemSettings }>('/admin/settings'),

    updateSettings: (data: Partial<SystemSettings>) =>
      request<{ settings: SystemSettings }>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),

    getOffices: () => request<{ offices: Office[] }>('/admin/offices'),

    createOffice: (data: CreateOfficeData) =>
      request<{ office: Office }>('/admin/offices', { method: 'POST', body: JSON.stringify(data) }),

    updateOffice: (id: string, data: Partial<CreateOfficeData & { isActive: boolean }>) =>
      request<{ office: Office }>(`/admin/offices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    getBlacklist: () => request<{ entries: BlacklistEntry[] }>('/admin/blacklist'),

    addBlacklist: (plate: string, reason?: string) =>
      request<{ entry: BlacklistEntry }>('/admin/blacklist', { method: 'POST', body: JSON.stringify({ plate, reason }) }),

    deleteBlacklist: (id: string) =>
      request<{ ok: boolean }>(`/admin/blacklist/${id}`, { method: 'DELETE' }),

    getDailyReport: (date?: string) =>
      request<DailyReport>(`/admin/reports/daily${date ? `?date=${date}` : ''}`),
  },
};

export interface SiteSettings {
  siteName: string;
  siteIcon: string;
  siteTagline: string;
  sitePhone: string;
  siteEmail: string;
}

export interface BcConfig extends SiteSettings {
  businessCenterName: string;
  workingHoursFrom: string;
  workingHoursTo: string;
  contactPhone: string;
  contactEmail: string;
  receptionFloor: string;
  maxPassesPerDay: number;
}

export interface PassStats {
  today: string;
  todayCount: number;
  weekCount: number;
  byStatus: Record<string, number>;
  todayByType: Record<string, number>;
}

export interface Office {
  id: string;
  propertyId: string;
  businessCenterName?: string;
  number: string;
  floor: string;
  areaSqm?: number;
  company?: string;
  tenantId?: string;
  tenantName?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateOfficeData {
  propertyId: string;
  number: string;
  floor: string;
  areaSqm?: number;
  company?: string;
  tenantId?: string;
}

export interface BlacklistEntry {
  id: string;
  plate: string;
  reason?: string;
  createdAt: string;
}

export interface DailyReport {
  date: string;
  summary: Array<{
    pass_type: string;
    status: string;
    office: string;
    floor?: string;
    company_name?: string;
    c: number;
  }>;
  visitors: Array<{
    visitor_name: string;
    company_name?: string;
    office: string;
    floor?: string;
    pass_type: string;
    status: string;
    visit_time_from?: string;
    pass_number: string;
  }>;
}

export type UserCategory = 'tenants' | 'staff';

export interface UserFilters {
  category?: UserCategory;
  role?: string;
  search?: string;
  isActive?: '' | 'true' | 'false';
  propertyId?: string;
  officeId?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  company?: string;
  role: UserRole;
  office?: string;
  floor?: string;
  isActive: boolean;
  createdAt: string;
  passesCount?: number;
  offices?: TenantOffice[];
  businessCenters?: { id: string; name: string }[];
  propertyIds?: string[];
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  company?: string;
  role: UserRole;
  office?: string;
  floor?: string;
  officeIds?: string[];
  propertyIds?: string[];
}

export function formatTenantOffices(offices?: TenantOffice[]): string {
  if (!offices?.length) return '';
  return offices
    .map((o) => `${o.businessCenterName ? `${o.businessCenterName}: ` : ''}оф. ${o.number}${o.floor ? ` (${o.floor} эт.)` : ''}`)
    .join(' · ');
}

export interface PassTemplate {
  id: string;
  name: string;
  source: 'manual' | 'from_pass';
  sourcePassId?: string;
  visitorName: string;
  visitorPhone?: string;
  companyName?: string;
  visitPurpose?: string;
  passType: PassType;
  vehiclePlate?: string;
  vehicleModel?: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  officeId?: string;
  businessCenterName?: string;
  office?: string;
  floor?: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePassTemplateData {
  name: string;
  visitorName: string;
  visitorPhone?: string;
  companyName?: string;
  visitPurpose?: string;
  passType: PassType;
  vehiclePlate?: string;
  vehicleModel?: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  officeId?: string;
  office?: string;
  floor?: string;
  comment?: string;
}

export interface BusinessCenter {
  id: string;
  name: string;
  address?: string;
  officesCount: number;
  totalAreaSqm?: number;
  isActive: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export function formatAuditEntity(entry: AuditEntry): string {
  if (entry.entityLabel) return entry.entityLabel;

  const type = AUDIT_ENTITY_LABELS[entry.entityType] || entry.entityType;
  const d = entry.details || {};

  if (entry.entityType === 'pass') {
    const passNumber = d.passNumber as string | undefined;
    const visitorName = d.visitorName as string | undefined;
    if (passNumber && visitorName) return `${type} ${passNumber} · ${visitorName}`;
    if (passNumber) return `${type} ${passNumber}`;
  }
  if (entry.entityType === 'user') {
    const fullName = d.fullName as string | undefined;
    const email = d.email as string | undefined;
    if (fullName) return `${type}: ${fullName}`;
    if (email) return `${type}: ${email}`;
  }

  return type;
}

export interface AuditFilters {
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  action?: string;
  entityType?: string;
  search?: string;
}

function buildAuditQuery(filters: AuditFilters = {}) {
  const q = new URLSearchParams();
  if (filters.offset !== undefined) q.set('offset', String(filters.offset));
  if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) q.set('dateTo', filters.dateTo);
  if (filters.action) q.set('action', filters.action);
  if (filters.entityType) q.set('entityType', filters.entityType);
  if (filters.search) q.set('search', filters.search);
  return q.toString();
}

export interface SystemSettings {
  business_center_name: string;
  max_passes_per_day: string;
  auto_approve_delivery: string;
  working_hours_from: string;
  working_hours_to: string;
  contact_phone: string;
  contact_email: string;
  reception_floor: string;
}

export interface AdminDashboard {
  stats: {
    users: { total: number; byRole: Record<string, number> };
    passes: { total: number; today: number; week: number; byStatus: Record<string, number> };
    businessCenters: number;
  };
  recentActivity: AuditEntry[];
  settings: SystemSettings;
}

export const STATUS_LABELS: Record<PassStatus, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  active: 'В здании',
  completed: 'Покинул БЦ',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

export const TYPE_LABELS: Record<PassType, string> = {
  visitor: 'Посетитель',
  parking: 'Парковка',
  delivery: 'Доставка',
  contractor: 'Подрядчик',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: 'Арендатор',
  security: 'Ресепшн / Охрана',
  bc_admin: 'Администратор БЦ',
  admin: 'Супер-администратор',
};

export const AUDIT_LABELS: Record<string, string> = {
  'pass.create': 'Создание пропуска',
  'pass.approved': 'Одобрение',
  'pass.rejected': 'Отклонение',
  'pass.cancelled': 'Отмена',
  'pass.check_in': 'Вход в БЦ',
  'pass.check_out': 'Выход из БЦ',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'settings.update': 'Изменение настроек',
  'office.create': 'Добавление офиса',
  'office.update': 'Изменение офиса',
  'bc.create': 'Создание БЦ',
  'bc.update': 'Изменение БЦ',
  'permissions.update': 'Изменение прав доступа',
  'site_settings.update': 'Изменение настроек сайта',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  pass: 'Пропуск',
  user: 'Пользователь',
  office: 'Офис',
  business_center: 'Бизнес-центр',
  property: 'Бизнес-центр',
  access_config: 'Права доступа',
  app_settings: 'Настройки сайта',
};