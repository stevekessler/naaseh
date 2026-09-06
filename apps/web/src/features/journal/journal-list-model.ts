import type { JournalEntryProjection } from '@naaseh/domain';

export function journalListModel(
  entries: JournalEntryProjection[],
  filters: { start?: string; end?: string },
) {
  if (filters.start && filters.end && filters.start > filters.end)
    throw new Error('Start date must be on or before end date.');
  return entries
    .filter(
      (entry) =>
        (!filters.start || entry.date >= filters.start) &&
        (!filters.end || entry.date <= filters.end),
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((entry) => ({
      id: entry.id,
      date: entry.date,
      href: `/journal/${encodeURIComponent(entry.id)}`,
    }));
}
