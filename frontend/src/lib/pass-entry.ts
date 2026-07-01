import { PassStatus } from './api';

/** Пропуск ожидает входа (без отдельного этапа одобрения). */
export function isAwaitingEntry(status: PassStatus): boolean {
  return status === 'approved' || status === 'pending';
}