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