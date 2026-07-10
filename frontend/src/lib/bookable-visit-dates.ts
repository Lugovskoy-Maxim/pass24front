import { addDays, getLocalDateString, isValidVisitDateString } from './local-date';

export function parseClosedWeekdays(value?: string | number[] | null): number[] {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
  }
  if (!value?.toString().trim()) return [];
  return [...new Set(
    value
      .toString()
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

export function validateBookableVisitDate(
  value: string,
  bookableDates: string[],
  today = getLocalDateString(),
): string | undefined {
  if (!value?.trim()) return 'Укажите дату визита';
  if (!isValidVisitDateString(value)) return 'Некорректная дата';
  if (value < today) return 'Нельзя заказать пропуск на прошедшую дату';
  if (!bookableDates.includes(value)) {
    return bookableDates.length === 1
      ? 'Доступна только одна дата для заказа'
      : 'Выберите одну из доступных дат';
  }
  return undefined;
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
] as const;

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function formatVisitDateChip(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);

  return {
    day: d,
    weekday: WEEKDAY_SHORT[dt.getDay()],
    month: dt.toLocaleDateString('ru-RU', { month: 'long' }),
  };
}