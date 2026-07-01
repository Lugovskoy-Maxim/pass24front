import { PassStatus } from './api';

/** Цвета для recharts — синхронизированы с CSS-переменными статусов. */
export const CHART_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#3b82f6',
  active: '#10b981',
  completed: '#9ca3af',
  rejected: '#ef4444',
  expired: '#9ca3af',
  cancelled: '#9ca3af',
  overdue: '#ea580c',
  total: '#eb711c',
};

export const CHART_ROLE_COLORS = ['#eb711c', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];

export const CHART_TYPE_COLORS: Record<string, string> = {
  visitor: '#3b82f6',
  parking: '#8b5cf6',
  delivery: '#f59e0b',
  contractor: '#10b981',
};

export function statusChartColor(status: PassStatus | 'overdue' | 'total'): string {
  return CHART_STATUS_COLORS[status] || '#9ca3af';
}