import {
  matchesUrgencySet,
  zeroUrgencyCounts,
  type CompletionEvent,
  type Urgency,
} from '@naaseh/domain';
import { listCompletionEventsForUser } from './completion-event-repository.js';

export type ReportPeriod = 'day' | 'week' | 'month';
export interface CompletionReportQuery {
  userId: string;
  timeZone: string;
  period: ReportPeriod;
  from: string;
  to: string;
  weekStartsOn?: number;
  categoryId?: string | 'unassigned';
  projectId?: string | 'unassigned';
  urgencies?: readonly Urgency[];
  /** Pins reversal evaluation for a stable report traversal. */
  asOf?: string;
}

const parseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Dates must be valid calendar dates.');
  return date;
};
const keyForDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, amount: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return keyForDate(date);
};

export function validateIanaZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).formatToParts(new Date(0));
  } catch {
    throw new Error('A valid IANA time zone is required.');
  }
  return timeZone;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function completionDateFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
      timeZone: validateIanaZone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function completionLocalDate(occurredAt: string, timeZone: string) {
  const values = Object.fromEntries(
    completionDateFormatter(timeZone)
      .formatToParts(new Date(occurredAt))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function completionPeriodKey(date: string, period: ReportPeriod, weekStartsOn = 0) {
  if (period === 'day') return date;
  if (period === 'month') return date.slice(0, 7);
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6)
    throw new Error('Week start must be from 0 through 6.');
  const offset = (parseDate(date).getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

const eventMatchesScope = (event: CompletionEvent, query: CompletionReportQuery) => {
  if (query.projectId === 'unassigned' && event.projectIdAtCompletion) return false;
  if (
    query.projectId &&
    query.projectId !== 'unassigned' &&
    event.projectIdAtCompletion !== query.projectId
  )
    return false;
  if (query.categoryId === 'unassigned' && event.categoryIdAtCompletion) return false;
  if (
    query.categoryId &&
    query.categoryId !== 'unassigned' &&
    event.categoryIdAtCompletion !== query.categoryId
  )
    return false;
  return true;
};

export function calculateCompletionReport(
  events: readonly CompletionEvent[],
  query: CompletionReportQuery,
) {
  validateIanaZone(query.timeZone);
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  const days = Math.round((to.valueOf() - from.valueOf()) / 86_400_000);
  if (days < 0 || days > 366) throw new Error('Report range must be between 0 and 366 days.');
  const counts = new Map<string, number>();
  const urgencyByPeriod = new Map<string, ReturnType<typeof zeroUrgencyCounts>>();
  for (let day = query.from; day <= query.to; day = addDays(day, 1))
    urgencyByPeriod.set(
      completionPeriodKey(day, query.period, query.weekStartsOn),
      zeroUrgencyCounts(),
    );
  for (const key of urgencyByPeriod.keys()) counts.set(key, 0);
  const asOf = query.asOf ?? new Date().toISOString();
  const urgencyCounts = zeroUrgencyCounts();
  const matchingEvents: CompletionEvent[] = [];
  for (const event of events) {
    const countedAtAsOf = event.counted || Boolean(event.reversedAt && event.reversedAt > asOf);
    if (
      !countedAtAsOf ||
      event.occurredAt > asOf ||
      event.completedBy !== query.userId ||
      !eventMatchesScope(event, query) ||
      !matchesUrgencySet(event.urgencyAtCompletion, query.urgencies)
    )
      continue;
    const localDate = completionLocalDate(event.occurredAt, query.timeZone);
    if (localDate < query.from || localDate > query.to) continue;
    const key = completionPeriodKey(localDate, query.period, query.weekStartsOn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    urgencyByPeriod.get(key)![event.urgencyAtCompletion] += 1;
    urgencyCounts[event.urgencyAtCompletion] += 1;
    matchingEvents.push(event);
  }
  const buckets = [...counts].map(([key, count]) => ({
    key,
    count,
    urgencyCounts: urgencyByPeriod.get(key) ?? zeroUrgencyCounts(),
  }));
  return {
    userId: query.userId,
    period: query.period,
    timeZone: query.timeZone,
    from: query.from,
    to: query.to,
    asOf,
    buckets,
    total: matchingEvents.length,
    urgencyCounts,
    // Kept as a transitional internal alias for existing report consumers.
    urgencyBreakdown: urgencyCounts,
    events: matchingEvents,
  };
}

export async function getCompletionReport(
  query: CompletionReportQuery,
  loadEvents = listCompletionEventsForUser,
) {
  const report = calculateCompletionReport(await loadEvents(query.userId), query);
  return {
    period: report.period,
    timeZone: report.timeZone,
    from: report.from,
    to: report.to,
    asOf: report.asOf,
    buckets: report.buckets,
    total: report.total,
    urgencyCounts: report.urgencyCounts,
  };
}
