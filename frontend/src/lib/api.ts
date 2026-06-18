const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export type UserRole = 'resident' | 'security' | 'admin';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  apartment?: string;
  building?: string;
}

export type PassStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'expired' | 'cancelled';
export type PassType = 'guest' | 'vehicle' | 'delivery' | 'service';

export interface Pass {
  id: string;
  passNumber: string;
  createdBy: string;
  creatorName?: string;
  guestName: string;
  guestPhone?: string;
  passType: PassType;
  vehiclePlate?: string;
  vehicleModel?: string;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  apartment: string;
  building?: string;
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
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: { email: string; password: string; fullName: string; phone?: string; apartment?: string; building?: string }) =>
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
    guestName: string;
    guestPhone?: string;
    passType: PassType;
    vehiclePlate?: string;
    vehicleModel?: string;
    visitDate: string;
    visitTimeFrom?: string;
    visitTimeTo?: string;
    apartment: string;
    building?: string;
    comment?: string;
  }) =>
    request<{ pass: Pass }>('/passes', { method: 'POST', body: JSON.stringify(data) }),

  updateStatus: (id: string, status: string, rejectionReason?: string) =>
    request<{ pass: Pass }>(`/passes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason }),
    }),

  checkIn: (id: string) =>
    request<{ pass: Pass }>(`/passes/${id}/check-in`, { method: 'POST' }),

  checkOut: (id: string) =>
    request<{ pass: Pass }>(`/passes/${id}/check-out`, { method: 'POST' }),

  admin: {
    dashboard: () => request<AdminDashboard>('/admin/dashboard'),

    getUsers: (params?: { role?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.role) q.set('role', params.role);
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<{ users: AdminUser[] }>(`/admin/users${qs ? `?${qs}` : ''}`);
    },

    createUser: (data: CreateUserData) =>
      request<{ user: AdminUser }>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),

    updateUser: (id: string, data: Partial<CreateUserData & { isActive: boolean }>) =>
      request<{ user: AdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    getPricing: () => request<{ plans: PricingPlan[] }>('/admin/pricing'),

    updatePricing: (id: string, data: Partial<PricingPlan>) =>
      request<{ plan: PricingPlan }>(`/admin/pricing/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    getComplexes: () => request<{ complexes: Complex[] }>('/admin/complexes'),

    getAudit: (offset = 0) => request<{ entries: AuditEntry[]; total: number }>(`/admin/audit?offset=${offset}`),

    getSettings: () => request<{ settings: SystemSettings }>('/admin/settings'),

    updateSettings: (data: Partial<SystemSettings>) =>
      request<{ settings: SystemSettings }>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },
};

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  apartment?: string;
  building?: string;
  isActive: boolean;
  createdAt: string;
  passesCount?: number;
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  apartment?: string;
  building?: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  maxApartments: number;
  features: string[];
  isActive: boolean;
}

export interface Complex {
  id: string;
  name: string;
  address: string;
  apartmentsCount: number;
  planId: string;
  planName: string;
  priceMonthly: number;
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
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface SystemSettings {
  complex_name: string;
  max_passes_per_day: string;
  auto_approve_delivery: string;
  working_hours_from: string;
  working_hours_to: string;
  contact_phone: string;
  contact_email: string;
}

export interface AdminDashboard {
  stats: {
    users: { total: number; byRole: Record<string, number> };
    passes: { total: number; today: number; week: number; byStatus: Record<string, number> };
    revenue: { monthlyTotal: number; complexes: number };
  };
  recentActivity: AuditEntry[];
  settings: SystemSettings;
}

export const AUDIT_LABELS: Record<string, string> = {
  'pass.create': 'Создание пропуска',
  'pass.approved': 'Одобрение',
  'pass.rejected': 'Отклонение',
  'pass.cancelled': 'Отмена',
  'pass.check_in': 'Въезд',
  'pass.check_out': 'Выезд',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'pricing.update': 'Изменение тарифа',
  'settings.update': 'Изменение настроек',
};

export const STATUS_LABELS: Record<PassStatus, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  active: 'На территории',
  completed: 'Завершён',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

export const TYPE_LABELS: Record<PassType, string> = {
  guest: 'Гость',
  vehicle: 'Автомобиль',
  delivery: 'Доставка',
  service: 'Служба',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  resident: 'Житель',
  security: 'Охрана',
  admin: 'Администратор',
};