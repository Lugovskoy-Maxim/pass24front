import { addDays, getLocalDateString, isValidVisitDateString } from './visit-date';

export function parseClosedWeekdays(value?: string | null): number[] {
  if (!value?.trim()) return [];
  return [...new Set(
    value
      .split(',')
      .map((part) => parseInt(part.trim(), 10))
      .filter((day) => day >= 0 && day <= 6),
  )].sort((a, b) => a - b);
}

export function serializeClosedWeekdays(days: number[]): string {
  return [...new Set(days.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b).join(',');
}

export function getWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function isClosedWeekday(dateStr: string, closedWeekdays: number[]): boolean {
  return closedWeekdays.includes(getWeekday(dateStr));
}

export function getBookableVisitDates(
  today = getLocalDateString(),
  closedWeekdays: number[] = [],
  count = 2,
): string[] {
  const dates: string[] = [];
  let cursor = today;
  let scanned = 0;

  while (dates.length < count && scanned < 21) {
    if (!isClosedWeekday(cursor, closedWeekdays)) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
    scanned += 1;
  }

  return dates;
}

export function assertVisitDateBookable(
  visitDate: string,
  today = getLocalDateString(),
  closedWeekdays: number[] = [],
): void {
  if (!isValidVisitDateString(visitDate)) {
    throw new Error('INVALID_DATE');
  }

  const bookable = getBookableVisitDates(today, closedWeekdays, 2);
  if (bookable.includes(visitDate)) return;

  if (visitDate < today) {
    throw new Error('PAST_DATE');
  }
  throw new Error('NOT_BOOKABLE');
}