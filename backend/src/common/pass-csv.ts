import { escapeCsvCell } from './office-csv';

export const PASS_CSV_HEADERS = [
  'Номер пропуска',
  'Статус',
  'Тип',
  'Дата визита',
  'Время с',
  'Время до',
  'Посетитель',
  'Телефон посетителя',
  'Компания',
  'Цель визита',
  'БЦ',
  'Офис',
  'Этаж',
  'Авто',
  'Модель авто',
  'Заказчик',
  'Компания заказчика',
  'Телефон заказчика',
  'Одобрил',
  'Вход',
  'Выход',
  'Комментарий',
  'Создан',
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  active: 'В здании',
  completed: 'Покинул БЦ',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

const TYPE_LABELS: Record<string, string> = {
  visitor: 'Посетитель',
  parking: 'Парковка',
  delivery: 'Доставка',
  contractor: 'Подрядчик',
};

export interface PassCsvRow {
  passNumber: string;
  status: string;
  passType: string;
  visitDate: string;
  visitTimeFrom?: string;
  visitTimeTo?: string;
  visitorName: string;
  visitorPhone?: string;
  companyName?: string;
  visitPurpose?: string;
  businessCenterName?: string;
  office?: string;
  floor?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  creatorName?: string;
  creatorCompany?: string;
  creatorPhone?: string;
  approverName?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  comment?: string;
  createdAt?: string | Date;
}

function formatDateTime(value?: string | Date): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
}

export function buildPassCsv(rows: PassCsvRow[], options?: { includeCreator?: boolean }): string {
  const includeCreator = options?.includeCreator !== false;
  const headers = includeCreator
    ? [...PASS_CSV_HEADERS]
    : PASS_CSV_HEADERS.filter((h) => !['Заказчик', 'Компания заказчика', 'Телефон заказчика'].includes(h));

  const body = rows.map((row) => {
    const cells = [
      escapeCsvCell(row.passNumber || ''),
      escapeCsvCell(STATUS_LABELS[row.status] || row.status || ''),
      escapeCsvCell(TYPE_LABELS[row.passType] || row.passType || ''),
      escapeCsvCell(row.visitDate || ''),
      escapeCsvCell(row.visitTimeFrom || ''),
      escapeCsvCell(row.visitTimeTo || ''),
      escapeCsvCell(row.visitorName || ''),
      escapeCsvCell(row.visitorPhone || ''),
      escapeCsvCell(row.companyName || ''),
      escapeCsvCell(row.visitPurpose || ''),
      escapeCsvCell(row.businessCenterName || ''),
      escapeCsvCell(row.office || ''),
      escapeCsvCell(row.floor || ''),
      escapeCsvCell(row.vehiclePlate || ''),
      escapeCsvCell(row.vehicleModel || ''),
    ];

    if (includeCreator) {
      cells.push(
        escapeCsvCell(row.creatorName || ''),
        escapeCsvCell(row.creatorCompany || ''),
        escapeCsvCell(row.creatorPhone || ''),
      );
    }

    cells.push(
      escapeCsvCell(row.approverName || ''),
      escapeCsvCell(formatDateTime(row.checkedInAt)),
      escapeCsvCell(formatDateTime(row.checkedOutAt)),
      escapeCsvCell(row.comment || ''),
      escapeCsvCell(formatDateTime(row.createdAt)),
    );

    return cells.join(';');
  });

  return [headers.join(';'), ...body].join('\n');
}