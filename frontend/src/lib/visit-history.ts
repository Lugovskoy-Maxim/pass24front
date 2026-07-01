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