export type HistoryScope = 'visitor' | 'office' | 'company' | 'bc';

export interface HistoryQuery {
  scope: HistoryScope;
  visitorName?: string;
  visitorPhone?: string;
  visitorPassportSeries?: string;
  visitorPassportNumber?: string;
  officeId?: string;
  officeLabel?: string;
  companyName?: string;
  propertyId?: string;
  bcName?: string;
}

export function buildHistoryHref(query: HistoryQuery): string {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.visitorName) params.set('visitorName', query.visitorName);
  if (query.visitorPhone) params.set('visitorPhone', query.visitorPhone);
  if (query.visitorPassportSeries) params.set('visitorPassportSeries', query.visitorPassportSeries);
  if (query.visitorPassportNumber) params.set('visitorPassportNumber', query.visitorPassportNumber);
  if (query.officeId) params.set('officeId', query.officeId);
  if (query.officeLabel) params.set('officeLabel', query.officeLabel);
  if (query.companyName) params.set('companyName', query.companyName);
  if (query.propertyId) params.set('propertyId', query.propertyId);
  if (query.bcName) params.set('bcName', query.bcName);
  return `/history?${params.toString()}`;
}

export function historyTitle(query: HistoryQuery): string {
  switch (query.scope) {
    case 'visitor':
      return query.visitorName || query.visitorPhone || 'Посетитель';
    case 'office':
      return query.officeLabel ? `Офис ${query.officeLabel}` : 'Офис';
    case 'company':
      return query.companyName || 'Компания';
    case 'bc':
      return query.bcName || 'Бизнес-центр';
    default:
      return 'История проходов';
  }
}

/** Russian plural for «визит»: 1 визит, 2 визита, 5 визитов */
export function formatVisitCount(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} визит`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} визита`;
  return `${n} визитов`;
}