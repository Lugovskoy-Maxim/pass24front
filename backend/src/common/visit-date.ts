export function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidVisitDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function assertVisitDateNotPast(visitDate: string, today = getLocalDateString()): void {
  if (!isValidVisitDateString(visitDate)) {
    throw new Error('INVALID_DATE');
  }
  if (visitDate < today) {
    throw new Error('PAST_DATE');
  }
}