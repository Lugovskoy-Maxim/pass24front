import { buildWeeklyQualityReport } from './quality-report';

describe('weekly quality report', () => {
  const previousWeek = new Date('2026-11-15T20:59:59Z');
  const start = new Date('2026-11-15T21:00:00Z');
  const later = new Date('2026-11-16T09:00:00Z');
  const end = new Date('2026-11-22T21:00:00Z');
  const rating = (createdAt: Date, score: number, receivedAt: Date) => ({
    createdAt,
    answer: { score, receivedAt },
  });

  it('counts all weekly answers and uses only the latest answer per ticket for ratings', () => {
    const result = buildWeeklyQualityReport(
      [
        {
          createdAt: previousWeek,
          officeId: '401',
          important: true,
          requests: [
            rating(previousWeek, 1, start),
            rating(later, 5, later),
            rating(later, 2, end),
          ],
        },
        {
          createdAt: start,
          officeId: '401',
          important: true,
          requests: [rating(start, 3, later)],
        },
        {
          createdAt: end,
          officeId: '401',
          important: true,
          requests: [{ createdAt: end }],
        },
        { createdAt: start, officeId: '402', important: true, requests: [] },
        { createdAt: start, officeId: '401', requests: [] },
        {
          createdAt: start,
          officeId: '401',
          important: true,
          excluded: true,
          requests: [rating(start, 1, start)],
        },
        {
          createdAt: previousWeek,
          officeId: '401',
          important: true,
          excluded: true,
          requests: [],
        },
      ],
      '2026-11-16',
      { officeId: '401', importantOnly: true },
    );
    expect(result).toEqual({
      created: 1,
      requested: 3,
      answered: 3,
      excluded: 1,
      average: 4,
      distribution: [0, 0, 1, 0, 1],
    });
  });

  it('returns no average for an empty week and rejects invalid week starts', () => {
    expect(buildWeeklyQualityReport([], '2026-11-16').average).toBeNull();
    expect(() => buildWeeklyQualityReport([], '2026-11-17')).toThrow(
      RangeError,
    );
    expect(() => buildWeeklyQualityReport([], '2026-02-30')).toThrow(
      RangeError,
    );
  });
});
