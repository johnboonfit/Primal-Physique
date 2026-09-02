export type TimeRangeKey = '1w' | '1m' | '6m' | '1y' | 'all';

// Days to look back from "today" for each range — 'all' has no cutoff.
// Shared by every Progress sub-tab that filters an already-loaded list of
// dated entries client-side, so the range definitions and the filtering
// rule can't drift between them.
export const TIME_RANGES: { key: TimeRangeKey; label: string; days: number | null }[] = [
  { key: '1w', label: '1W', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All Time', days: null },
];

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Narrows a list of dated entries to the given range, as of `today` —
 * never re-fetches or recalculates anything, just filters what's already
 * been loaded. 'all' returns every entry unchanged. */
export function filterByRange<T extends { logDate: string }>(entries: T[], rangeKey: TimeRangeKey, today: string): T[] {
  const days = TIME_RANGES.find((r) => r.key === rangeKey)?.days ?? null;
  if (days === null) return entries;
  const cutoff = addDays(today, -days);
  return entries.filter((entry) => entry.logDate >= cutoff);
}
