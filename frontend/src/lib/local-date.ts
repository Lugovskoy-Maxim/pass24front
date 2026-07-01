/** Локальная дата YYYY-MM-DD (не UTC). */
export function getLocalDateString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidVisitDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isPastVisitDate(value: string, today = getLocalDateString()): boolean {
  if (!isValidVisitDateString(value)) return true;
  return value < today;
}

export function validateVisitDate(value: string, today = getLocalDateString()): string | undefined {
  if (!value?.trim()) return 'Укажите дату визита';
  if (!isValidVisitDateString(value)) return 'Некорректная дата';
  if (isPastVisitDate(value, today)) return 'Нельзя заказать пропуск на прошедшую дату';
  return undefined;
}