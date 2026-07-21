import {
  ApiError,
  getErrorMessage,
  messageForStatus,
  parseErrorBody,
  throwForResponse,
} from './api-errors';

export { ApiError, getErrorMessage, getErrorStatus, isNetworkError } from './api-errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

export type SystemUserRole = 'tenant' | 'security' | 'bc_admin' | 'admin';
export type UserRole = SystemUserRole | (string & {});

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
  workingHoursFrom?: string;
  workingHoursTo?: string;
  closedWeekdays?: number[];
}

export interface PublicBusinessCenter {
  id: string;
  name: string;
  workingHoursFrom: string;
  workingHoursTo: string;
  requireCheckout?: boolean;
  closedWeekdays?: number[];
}

export interface ProfileChangeRequest {
  last_name: string;
  first_name: string;
  middle_name?: string;
  full_name: string;
  phone?: string;
  company?: string;
  requested_at: string;
}

export interface User {
  id: string;
  username?: string;
  email?: string;
  email_verified?: boolean;
  full_name: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  profile_change_request?: ProfileChangeRequest | null;
  phone?: string;
  company?: string;
  role: UserRole;
  office?: string;
  floor?: string;
  offices?: TenantOffice[];
  permissions?: string[];
  enabledPassTypes?: PassType[];
  parent_tenant_id?: string;
  is_tenant_owner?: boolean;
  is_active?: boolean;
  role_label?: string;
}

export interface TenantEmployee {
  id: string;
  email: string;
  full_name: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  phone?: string;
  is_active: boolean;
  role: string;
  role_label: string;
  created_at: string;
}

export interface EmployeeRole {
  key: string;
  label: string;
  permissions: string[];
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
  systemRoles?: string[];
  builtinEmployeeRoles?: string[];
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
  requireCheckout?: boolean;
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
  creatorPhone?: string;
  visitorName: string;
  visitorPhone?: string;
  visitorPassportSeries?: string;
  visitorPassportNumber?: string;
  visitorPassportIssuedBy?: string;
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
  requireCheckout?: boolean;
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
    await throwForResponse(res);
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

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    throw new ApiError(
      getErrorMessage(error, 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.'),
      { isNetworkError: true },
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('pass24_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    await throwForResponse(res);
  }

  if (res.status === 204 || !contentType.includes('application/json')) {
    return {} as T;
  }

  const data = await res.json().catch(() => ({}));
  return data as T;
}

export const api = {
  login: (login: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, email: login, password }),
    }),

  registerRequestCode: (data: {
    email?: string;
    phone?: string;
    verificationChannel?: 'email' | 'phone';
    password: string;
    passwordConfirm: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    company: string;
  }) =>
    request<{
      verificationRequired: true;
      verificationChannel: 'email' | 'phone';
      message: string;
      expiresInMinutes: number;
      retryAfterSeconds?: number;
    }>(
      '/auth/register/request-code',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  registerConfirm: (data: { email?: string; phone?: string; code: string }) =>
    request<{ pendingApproval: true; message: string }>('/auth/register/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  requestPasswordReset: (data: { email: string }) =>
    request<{
      recoveryChannel: 'email' | 'admin';
      message: string;
      expiresInMinutes?: number;
      retryAfterSeconds?: number;
      contact?: { phone?: string; email?: string };
    }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  confirmPasswordReset: (data: {
    email: string;
    code: string;
    password: string;
    passwordConfirm: string;
  }) =>
    request<{ message: string }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  getDevAccounts: () =>
    request<{ accounts: Array<{ label: string; email: string; password: string; role: UserRole }> }>(
      '/auth/dev-accounts',
    ),

  updateProfile: (data: {
    lastName: string;
    firstName: string;
    middleName?: string;
    phone?: string;
    company?: string;
  }) =>
    request<{ user: User }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),

  cancelProfileRequest: () =>
    request<{ user: User }>('/auth/profile/request', { method: 'DELETE' }),

  getTenantEmployees: () =>
    request<{ employees: TenantEmployee[] }>('/auth/tenant/employees'),

  addTenantEmployee: (data: {
    email: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    password: string;
    phone?: string;
    role?: string;
  }) =>
    request<{ employee: TenantEmployee }>('/auth/tenant/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeTenantEmployee: (id: string) =>
    request<{ message: string }>(`/auth/tenant/employees/${id}`, { method: 'DELETE' }),

  getTenantEmployeeRoles: () =>
    request<{ roles: EmployeeRole[] }>('/auth/tenant/employee-roles'),

  getPasses: (params?: { status?: string; date?: string; search?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.date) q.set('date', params.date);
    if (params?.search) q.set('search', params.search);
    if (params?.limit !== undefined) q.set('limit', String(params.limit));
    if (params?.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return request<{ passes: Pass[]; total: number; offset: number; limit: number; hasMore: boolean }>(
      `/passes${qs ? `?${qs}` : ''}`,
    );
  },

  getPassExportFilters: () =>
    request<PassExportFilters>('/passes/export-filters'),

  getPassReport: (filters: PassExportFiltersInput = {}) => {
    const qs = buildPassExportQuery(filters);
    return request<PassReportResult>(`/passes/report${qs ? `?${qs}` : ''}`);
  },

  exportPasses: async (filters: PassExportFiltersInput = {}) => {
    const qs = buildPassExportQuery(filters);
    const token = getToken();
    const datePart = filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom}_${filters.dateTo}`
      : filters.date || new Date().toISOString().slice(0, 10);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/passes/export${qs ? `?${qs}` : ''}`, {
        headers: {
          Accept: 'text/csv',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (error) {
      throw new ApiError(
        getErrorMessage(error, 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.'),
        { isNetworkError: true },
      );
    }
    await downloadFileResponse(res, `passes-${datePart}.csv`);
  },

  getJournal: (date?: string, search?: string) => {
    const q = new URLSearchParams();
    if (date) q.set('date', date);
    if (search?.trim()) q.set('search', search.trim());
    const qs = q.toString();
    return request<{ date: string; stats: { total: number; pending: number; active: number; completed: number; approved: number }; passes: Pass[] }>(
      `/passes/journal${qs ? `?${qs}` : ''}`,
    );
  },

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

  sendPassEmailWithStatus: async (passIdOrNumber: string, email: string) => {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(
        `${API_URL}/passes/${encodeURIComponent(passIdOrNumber)}/send-email`,
        { method: 'POST', headers, body: JSON.stringify({ email }) },
      );
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : {};

      if (res.ok) {
        return {
          ok: true as const,
          status: res.status,
          data: data as { sent: boolean; email: string },
        };
      }

      if (res.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('pass24_token');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }

      return {
        ok: false as const,
        status: res.status,
        message: messageForStatus(res.status, data as { message?: unknown; error?: unknown }),
      };
    } catch (error) {
      return {
        ok: false as const,
        status: 0,
        message: getErrorMessage(error, 'Сервер недоступен'),
      };
    }
  },

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

  getOverdueActive: () => request<{ count: number; passes: Pass[] }>('/passes/overdue-active'),

  lookupPass: (passNumber: string) =>
    request<{ pass: Pass }>(`/passes/lookup/${encodeURIComponent(passNumber)}`),

  getPassHistory: (params: {
    scope: 'visitor' | 'office' | 'company' | 'bc';
    visitorName?: string;
    visitorPhone?: string;
    visitorPassportSeries?: string;
    visitorPassportNumber?: string;
    officeId?: string;
    companyName?: string;
    propertyId?: string;
    limit?: number;
  }) => {
    const q = new URLSearchParams({ scope: params.scope });
    if (params.visitorName) q.set('visitorName', params.visitorName);
    if (params.visitorPhone) q.set('visitorPhone', params.visitorPhone);
    if (params.visitorPassportSeries) q.set('visitorPassportSeries', params.visitorPassportSeries);
    if (params.visitorPassportNumber) q.set('visitorPassportNumber', params.visitorPassportNumber);
    if (params.officeId) q.set('officeId', params.officeId);
    if (params.companyName) q.set('companyName', params.companyName);
    if (params.propertyId) q.set('propertyId', params.propertyId);
    if (params.limit) q.set('limit', String(params.limit));
    return request<{ scope: string; total: number; passes: Pass[] }>(`/passes/history?${q.toString()}`);
  },

  updatePassVisitorData: (id: string, data: {
    visitorPassportSeries?: string;
    visitorPassportNumber?: string;
    visitorPassportIssuedBy?: string;
  }) =>
    request<{ pass: Pass }>(`/passes/${id}/visitor-data`, { method: 'PATCH', body: JSON.stringify(data) }),

  getPublicTicket: async (passNumber: string) => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/passes/public/${encodeURIComponent(passNumber)}`);
    } catch (error) {
      throw new ApiError(
        getErrorMessage(error, 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.'),
        { isNetworkError: true },
      );
    }

    if (!res.ok) {
      const data = await parseErrorBody(res);
      const message = res.status === 404
        ? (data.message || data.error || 'Пропуск не найден')
        : messageForStatus(res.status, data);
      throw new ApiError(message, { status: res.status });
    }

    const data = await res.json().catch(() => ({}));
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

    getRegistrationRequests: () =>
      request<{ requests: AdminUser[] }>('/admin/registration-requests'),

    approveRegistration: (id: string) =>
      request<{ user: AdminUser }>(`/admin/users/${id}/registration/approve`, { method: 'POST' }),

    rejectRegistration: (id: string) =>
      request<{ message: string }>(`/admin/users/${id}/registration/reject`, { method: 'POST' }),

    getProfileChangeRequests: () =>
      request<{ requests: Array<{ user: AdminUser; request: ProfileChangeRequest }> }>('/admin/profile-change-requests'),

    approveProfileChange: (id: string) =>
      request<{ user: AdminUser }>(`/admin/users/${id}/profile-change/approve`, { method: 'POST' }),

    rejectProfileChange: (id: string) =>
      request<{ user: AdminUser }>(`/admin/users/${id}/profile-change/reject`, { method: 'POST' }),

    getBusinessCenters: () => request<{ businessCenters: BusinessCenter[] }>('/admin/business-centers'),

    createBusinessCenter: (data: { name: string; address: string; code?: string }) =>
      request<{ businessCenter: BusinessCenter }>('/admin/business-centers', { method: 'POST', body: JSON.stringify(data) }),

    updateBusinessCenter: (id: string, data: { name?: string; address?: string; passSettings?: Partial<BcPassSettings> }) =>
      request<{ businessCenter: BusinessCenter }>(`/admin/business-centers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteBusinessCenter: (id: string) =>
      request<{ message: string; id: string }>(`/admin/business-centers/${id}`, { method: 'DELETE' }),

    seedTestData: () =>
      request<{ message: string; businessCenters: number; offices: number; tenants: number; skipped: boolean }>(
        '/admin/seed-test-data',
        { method: 'POST' },
      ),

    getAccessConfig: () => request<AccessConfig>('/admin/access-config'),

    updateAccessConfig: (data: Partial<Pick<AccessConfig, 'enabledPassTypes' | 'rolePermissions' | 'roleLabels'>>) =>
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
      let res: Response;
      try {
        res = await fetch(`${API_URL}/admin/audit/export${qs ? `?${qs}` : ''}`, {
          headers: {
            Accept: 'text/csv',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      } catch (error) {
        throw new ApiError(
          getErrorMessage(error, 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.'),
          { isNetworkError: true },
        );
      }
      await downloadFileResponse(res, `audit-${datePart}.csv`);
    },

    getSiteSettings: () => request<{ settings: SiteSettings }>('/admin/site-settings'),

    updateSiteSettings: (data: Partial<SiteSettings>) =>
      request<{ settings: SiteSettings }>('/admin/site-settings', { method: 'PATCH', body: JSON.stringify(data) }),

    getOffices: () => request<{ offices: Office[] }>('/admin/offices'),

    exportOffices: async () => {
      const token = getToken();
      const datePart = new Date().toISOString().slice(0, 10);
      let res: Response;
      try {
        res = await fetch(`${API_URL}/admin/offices/export`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch (error) {
        throw new ApiError(
          getErrorMessage(error, 'Сервер недоступен. Проверьте подключение к сети и что backend запущен.'),
          { isNetworkError: true },
        );
      }
      await downloadFileResponse(res, `offices-${datePart}.csv`);
    },

    importOffices: (csv: string) =>
      request<{ created: number; skipped: number; errors: string[] }>('/admin/offices/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      }),

    createOffice: (data: CreateOfficeData) =>
      request<{ office: Office }>('/admin/offices', { method: 'POST', body: JSON.stringify(data) }),

    updateOffice: (id: string, data: Partial<CreateOfficeData & { isActive: boolean }>) =>
      request<{ office: Office }>(`/admin/offices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteOffice: (id: string) =>
      request<{ message: string; id: string }>(`/admin/offices/${id}`, { method: 'DELETE' }),

    getDailyReport: (date?: string) =>
      request<DailyReport>(`/admin/reports/daily${date ? `?date=${date}` : ''}`),
  },
};

export interface SiteSettings {
  siteName: string;
  siteIcon: string;
  siteIconLight: string;
  siteIconDark: string;
  siteTagline: string;
  sitePhone: string;
  siteEmail: string;
  brandMarkType: 'image' | 'text';
  brandMarkText: string;
  brandShowName: boolean;
  brandNameBeforeMark: boolean;
  uiIconSelectChevron: string;
  themePrimary: string;
  themePrimaryHover: string;
  uiLabels?: Record<string, unknown>;
  smsRegistrationEnabled?: boolean;
  smsRegistrationDisabledMessage?: string;
  smsRegistrationCodeText?: string;
}

export interface BcConfig extends SiteSettings {
  businessCenterName: string;
  businessCenters: PublicBusinessCenter[];
  contactPhone: string;
  contactEmail: string;
  receptionFloor: string;
}

export interface PassExportOfficeOption {
  id: string;
  propertyId?: string;
  number: string;
  businessCenterName?: string;
  company?: string;
}

export interface PassExportTenantOption {
  id: string;
  company: string;
  email?: string;
}

export interface PassExportFilters {
  scope: 'own' | 'all';
  businessCenters: Array<{ id: string; name: string }>;
  offices: PassExportOfficeOption[];
  tenants: PassExportTenantOption[];
}

export interface PassExportFiltersInput {
  status?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  passType?: PassType | '';
  propertyId?: string;
  officeId?: string;
  tenantId?: string;
  offset?: number;
  limit?: number;
}

export interface PassReportResult {
  passes: Pass[];
  total: number;
  offset: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}

function buildPassExportQuery(filters: PassExportFiltersInput = {}) {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.date) q.set('date', filters.date);
  if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) q.set('dateTo', filters.dateTo);
  if (filters.search) q.set('search', filters.search);
  if (filters.passType) q.set('passType', filters.passType);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  if (filters.officeId) q.set('officeId', filters.officeId);
  if (filters.tenantId) q.set('tenantId', filters.tenantId);
  if (filters.offset !== undefined) q.set('offset', String(filters.offset));
  if (filters.limit !== undefined) q.set('limit', String(filters.limit));
  return q.toString();
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
  floor?: string;
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
  floor?: string;
  areaSqm?: number;
  company?: string;
  tenantId?: string;
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
  emailVerified?: boolean;
  fullName: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  phone?: string;
  company?: string;
  role: UserRole;
  office?: string;
  floor?: string;
  isActive: boolean;
  profileChangeRequest?: ProfileChangeRequest | null;
  createdAt: string;
  passesCount?: number;
  offices?: TenantOffice[];
  businessCenters?: { id: string; name: string }[];
  propertyIds?: string[];
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
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

export interface BcPassSettings {
  auto_approve_delivery: string;
  working_hours_from: string;
  working_hours_to: string;
  contact_phone: string;
  contact_email: string;
  reception_floor: string;
  require_checkout: string;
  closed_weekdays: string;
}

export const DEFAULT_BC_PASS_SETTINGS: BcPassSettings = {
  auto_approve_delivery: 'false',
  working_hours_from: '08:00',
  working_hours_to: '20:00',
  contact_phone: '+7 (495) 000-00-00',
  contact_email: 'reception@pass24.local',
  reception_floor: '1',
  require_checkout: 'true',
  closed_weekdays: '',
};

export interface BusinessCenter {
  id: string;
  name: string;
  address?: string;
  officesCount: number;
  totalAreaSqm?: number;
  isActive: boolean;
  createdAt: string;
  passSettings?: BcPassSettings;
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

export interface AdminDashboard {
  stats: {
    users: { total: number; byRole: Record<string, number> };
    passes: { total: number; today: number; week: number; byStatus: Record<string, number> };
    businessCenters: number;
  };
  recentActivity: AuditEntry[];
  businessCenterNames: string[];
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

export const ROLE_LABELS: Record<SystemUserRole, string> = {
  tenant: 'Арендатор',
  security: 'Ресепшн / Охрана',
  bc_admin: 'Администратор БЦ',
  admin: 'Супер-администратор',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as SystemUserRole] || role;
}

export const AUDIT_LABELS: Record<string, string> = {
  'pass.create': 'Создание пропуска',
  'pass.approved': 'Одобрение',
  'pass.rejected': 'Отклонение',
  'pass.cancelled': 'Отмена',
  'pass.check_in': 'Вход в БЦ',
  'pass.check_out': 'Выход из БЦ',
  'pass.expired': 'Истечение пропуска',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'user.registration_request': 'Заявка на регистрацию',
  'user.registration_approved': 'Подтверждение регистрации',
  'user.registration_rejected': 'Отклонение регистрации',
  'settings.update': 'Изменение настроек',
  'office.create': 'Добавление офиса',
  'office.update': 'Изменение офиса',
  'office.delete': 'Удаление офиса',
  'bc.create': 'Создание БЦ',
  'bc.update': 'Изменение БЦ',
  'bc.delete': 'Удаление БЦ',
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