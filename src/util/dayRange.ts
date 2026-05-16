/**
 * Interprets `dateYmd` as a calendar date in `timeZone` and returns [start, end) as UTC ISO strings.
 */
export function getZonedDayUtcBounds(dateYmd: string, timeZone: string): {
  startIso: string;
  endIsoExclusive: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${dateYmd}`);
  }

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const formatDay = (ms: number): string => dayFormatter.format(new Date(ms));

  const anchor = Date.parse(`${dateYmd}T12:00:00.000Z`);
  let lo = anchor - 36 * 3600 * 1000;
  let hi = anchor + 36 * 3600 * 1000;

  for (let i = 0; i < 16; i++) {
    const loDay = formatDay(lo);
    const hiDay = formatDay(hi);
    if (loDay <= dateYmd && hiDay >= dateYmd) break;
    lo -= 24 * 3600 * 1000;
    hi += 24 * 3600 * 1000;
  }

  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const day = formatDay(mid);
    if (day < dateYmd) left = mid + 1;
    else right = mid;
  }

  const startMs = left;

  left = startMs;
  right = startMs + 48 * 3600 * 1000;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const day = formatDay(mid);
    if (day === dateYmd) left = mid + 1;
    else right = mid;
  }

  const endMs = left;

  return {
    startIso: new Date(startMs).toISOString(),
    endIsoExclusive: new Date(endMs).toISOString(),
  };
}

export function formatZonedYmd(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
