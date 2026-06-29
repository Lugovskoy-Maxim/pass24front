import { PassStatus } from './api';
import { UiLabels } from './ui-labels';

export type GuestOverdueKind = 'past_date' | 'past_end_time';

export type GuestOverduePass = {
  status: PassStatus;
  visitDate: string;
  visitTimeTo?: string;
};

export function getLocalDateString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function getLocalMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function getGuestOverdueKind(pass: GuestOverduePass, now = new Date()): GuestOverdueKind | null {
  if (pass.status !== 'active') return null;

  const today = getLocalDateString(now);
  if (pass.visitDate < today) return 'past_date';

  if (pass.visitDate === today && pass.visitTimeTo) {
    if (getLocalMinutes(now) > parseTimeToMinutes(pass.visitTimeTo)) {
      return 'past_end_time';
    }
  }

  return null;
}

export function isGuestStillInside(pass: GuestOverduePass, now = new Date()): boolean {
  return getGuestOverdueKind(pass, now) !== null;
}

export function getOverdueBadgeLabel(kind: GuestOverdueKind, labels: UiLabels): string {
  return kind === 'past_end_time'
    ? labels.reception.overdueEndTimeBadge
    : labels.reception.overdueInsideBadge;
}

export function getOverdueCardMessage(kind: GuestOverdueKind, pass: GuestOverduePass, labels: UiLabels): string {
  if (kind === 'past_end_time' && pass.visitTimeTo) {
    return labels.reception.overdueEndTimeCard.replace('{time}', pass.visitTimeTo);
  }
  return labels.reception.overdueInsideCard;
}

export function getOverdueBannerText(
  passes: GuestOverduePass[],
  labels: UiLabels,
  now = new Date(),
): { message: string; count: number; hasPastDate: boolean; hasPastEndTime: boolean } {
  const overdue = passes.filter((p) => getGuestOverdueKind(p, now));
  const hasPastDate = overdue.some((p) => getGuestOverdueKind(p, now) === 'past_date');
  const hasPastEndTime = overdue.some((p) => getGuestOverdueKind(p, now) === 'past_end_time');

  let message: string = labels.reception.overdueInsideBanner;
  if (hasPastEndTime && !hasPastDate) {
    message = labels.reception.overdueEndTimeBanner;
  } else if (hasPastEndTime && hasPastDate) {
    message = labels.reception.overdueMixedBanner;
  }

  return { message, count: overdue.length, hasPastDate, hasPastEndTime };
}