/**
 * Отображение номера пропуска и назначения (офис / БЦ / этаж).
 * Номер в БД уже вида Pass-2026-5326 — здесь только представление.
 */

export function normalizePassNumber(passNumber?: string | null): string {
  return (passNumber || '').trim();
}

/** Человекочитаемый номер: Pass-2026-5326 (без «склеивания» частей). */
export function formatPassNumber(passNumber?: string | null): string {
  const raw = normalizePassNumber(passNumber);
  if (!raw) return '—';
  // Уже наш формат
  if (/^Pass-\d{4}-\d+$/i.test(raw)) {
    const [, year, seq] = raw.split('-');
    return `Pass-${year}-${seq}`;
  }
  return raw;
}

export type OfficeDisplayParts = {
  office?: string | null;
  floor?: string | null;
  businessCenterName?: string | null;
  officePrefix?: string;
  floorSuffix?: string;
};

/** Кратко: «оф. 401 · 3 эт.» */
export function formatOfficeShort(parts: OfficeDisplayParts): string {
  const prefix = parts.officePrefix ?? 'оф.';
  const floorSuffix = parts.floorSuffix ?? 'эт.';
  const office = (parts.office || '').trim();
  if (!office) return '—';
  const floor = (parts.floor || '').trim();
  return floor
    ? `${prefix} ${office} · ${floor} ${floorSuffix}`
    : `${prefix} ${office}`;
}

/** Полная строка назначения: «оф. 401 · 3 эт. · Добрынинский» */
export function formatOfficeDestination(parts: OfficeDisplayParts): string {
  const short = formatOfficeShort(parts);
  if (short === '—') return '—';
  const bc = (parts.businessCenterName || '').trim();
  return bc ? `${short} · ${bc}` : short;
}

/**
 * Короткий «номер» офиса (401, 12А, 3/1) vs текстовое название («Спорт Экспрес»).
 * Для названий нужен меньший шрифт и перенос строк в карточке.
 */
export function isShortOfficeCode(office?: string | null): boolean {
  const o = (office || '').trim();
  if (!o) return true;
  // Пробелы / длинные строки — это название, не номер кабинета
  if (/\s/.test(o) || o.length > 6) return false;
  return true;
}
