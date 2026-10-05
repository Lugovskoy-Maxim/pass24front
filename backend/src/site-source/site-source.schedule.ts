import { createHash } from 'crypto';

export function dailyMysqlSlot(now: Date, time = '03:00') {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Invalid daily time');
  const moscow = new Date(now.getTime() + 3 * 3600000);
  const day = moscow.toISOString().slice(0, 10);
  let at = new Date(`${day}T${time}:00+03:00`);
  if (at > now) at = new Date(at.getTime() - 86400000);
  const key = new Date(at.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  const next = new Date(at.getTime() + 86400000);
  return { key, at, next };
}

/** Hash actual source fields, including metadata changes without post_modified. */
export function mysqlSourceFingerprint(groups: Record<string, unknown[]>) {
  const hash = createHash('sha256');
  for (const name of Object.keys(groups).sort()) {
    hash.update(name + '\n');
    const rows = groups[name]
      .map((row) => JSON.stringify(canonical(row)))
      .sort();
    for (const row of rows) hash.update(row + '\n');
  }
  return 'sha256:' + hash.digest('hex');
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
}
