export const OFFICE_CSV_HEADERS = [
  'БЦ',
  'Номер офиса',
  'Этаж',
  'Площадь',
  'Компания',
  'Email арендатора',
  'Активен',
] as const;

export interface OfficeCsvRow {
  businessCenter: string;
  number: string;
  floor?: string;
  areaSqm?: number;
  company?: string;
  tenantEmail?: string;
  isActive: boolean;
}

function detectDelimiter(headerLine: string): ';' | ',' {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: ';' | ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function escapeCsvCell(value: string): string {
  if (/[;"\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseBoolRu(value?: string, defaultValue = true): boolean {
  const v = (value || '').trim().toLowerCase();
  if (!v) return defaultValue;
  if (['да', 'yes', 'y', '1', 'true', 'активен'].includes(v)) return true;
  if (['нет', 'no', 'n', '0', 'false', 'неактивен'].includes(v)) return false;
  return defaultValue;
}

export function parseOfficeCsv(text: string): { rows: OfficeCsvRow[]; errors: string[] } {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    return { rows: [], errors: ['Файл пустой'] };
  }

  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return { rows: [], errors: ['Файл пустой'] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = parseCsvLine(lines[0], delimiter).map((c) => c.toLowerCase());
  const hasHeader = headerCells.some((c) => c.includes('бц') || c.includes('номер'));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: OfficeCsvRow[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, index) => {
    const rowNum = hasHeader ? index + 2 : index + 1;
    const cells = parseCsvLine(line, delimiter);
    if (cells.every((c) => !c)) return;

    const businessCenter = cells[0]?.trim();
    const number = cells[1]?.trim();
    if (!businessCenter || !number) {
      errors.push(`Строка ${rowNum}: укажите БЦ и номер офиса`);
      return;
    }

    const areaRaw = cells[3]?.trim().replace(',', '.');
    const areaSqm = areaRaw ? Number(areaRaw) : undefined;
    if (areaRaw && (areaSqm === undefined || !Number.isFinite(areaSqm) || areaSqm < 0)) {
      errors.push(`Строка ${rowNum}: некорректная площадь`);
      return;
    }

    rows.push({
      businessCenter,
      number,
      floor: cells[2]?.trim() || undefined,
      areaSqm,
      company: cells[4]?.trim() || undefined,
      tenantEmail: cells[5]?.trim().toLowerCase() || undefined,
      isActive: parseBoolRu(cells[6]),
    });
  });

  return { rows, errors };
}

export function buildOfficeCsv(rows: Array<{
  businessCenterName: string;
  number: string;
  floor?: string;
  areaSqm?: number;
  company?: string;
  tenantEmail?: string;
  isActive: boolean;
}>): string {
  const header = OFFICE_CSV_HEADERS.join(';');
  const body = rows.map((row) => [
    escapeCsvCell(row.businessCenterName || ''),
    escapeCsvCell(row.number || ''),
    escapeCsvCell(row.floor || ''),
    row.areaSqm !== undefined && row.areaSqm !== null ? String(row.areaSqm) : '',
    escapeCsvCell(row.company || ''),
    escapeCsvCell(row.tenantEmail || ''),
    row.isActive ? 'да' : 'нет',
  ].join(';'));

  return [header, ...body].join('\n');
}