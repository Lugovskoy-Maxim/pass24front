interface QualityRequest {
  createdAt: Date;
  answer?: { score: number; receivedAt: Date };
}

interface QualityTicket {
  createdAt: Date;
  officeId?: string;
  important?: boolean;
  excluded?: boolean;
  requests: QualityRequest[];
}

export function qualityWeekBounds(monday: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
    throw new RangeError('Expected a Monday in YYYY-MM-DD format');
  }
  const midnight = new Date(monday + 'T00:00:00Z');
  if (
    midnight.getUTCDay() !== 1 ||
    midnight.toISOString().slice(0, 10) !== monday
  ) {
    throw new RangeError('Expected a Monday in YYYY-MM-DD format');
  }
  const start = midnight.getTime() - 3 * 60 * 60 * 1000;
  return [start, start + 7 * 24 * 60 * 60 * 1000] as const;
}

export function buildWeeklyQualityReport(
  tickets: QualityTicket[],
  monday: string,
  filters: { officeId?: string; importantOnly?: boolean } = {},
) {
  const [start, end] = qualityWeekBounds(monday);
  const inWeek = (date: Date) =>
    date.getTime() >= start && date.getTime() < end;
  const distribution = [0, 0, 0, 0, 0];
  let created = 0;
  let requested = 0;
  let answered = 0;
  let excluded = 0;
  let rated = 0;
  let sum = 0;

  for (const ticket of tickets) {
    if (filters.officeId && filters.officeId !== ticket.officeId) continue;
    if (filters.importantOnly && !ticket.important) continue;

    const createdThisWeek = inWeek(ticket.createdAt);
    const requests = ticket.requests.filter((request) =>
      inWeek(request.createdAt),
    );
    const answers = ticket.requests.flatMap(({ answer }) =>
      answer && inWeek(answer.receivedAt) ? [answer] : [],
    );
    if (ticket.excluded) {
      if (createdThisWeek || requests.length || answers.length) excluded++;
      continue;
    }

    if (createdThisWeek) created++;
    requested += requests.length;
    answered += answers.length;
    const latest = answers.reduce<QualityRequest['answer']>(
      (previous, answer) =>
        !previous || answer.receivedAt >= previous.receivedAt
          ? answer
          : previous,
      undefined,
    );
    if (latest) {
      distribution[latest.score - 1]++;
      sum += latest.score;
      rated++;
    }
  }

  return {
    created,
    requested,
    answered,
    excluded,
    average: rated ? sum / rated : null,
    distribution,
  };
}
