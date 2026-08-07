import {
  matchesUrgencySet,
  zeroUrgencyCounts,
  type CompletionEvent,
  type Urgency,
} from '@naaseh/domain';

export type CompletionPeriod = 'day' | 'week' | 'month';

export interface CompletionBucket {
  key: string;
  count: number;
}

export interface CompletionBucketOptions {
  timeZone: string;
  period: CompletionPeriod;
  from: string;
  to: string;
  weekStartsOn?: number;
  categoryId?: string | 'unassigned';
  projectId?: string | 'unassigned';
  urgencies?: readonly Urgency[];
}

const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

export function assertIanaTimeZone(timeZone: string): string {
  try {
    dateFormatter(timeZone).formatToParts(new Date(0));
  } catch {
    throw new Error('A valid IANA time zone is required.');
  }
  return timeZone;
}

export function localDateKey(instant: string | Date, timeZone: string): string {
  const parts = Object.fromEntries(
    dateFormatter(assertIanaTimeZone(timeZone))
      .formatToParts(typeof instant === 'string' ? new Date(instant) : instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
};
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
};

export function periodKey(localDate: string, period: CompletionPeriod, weekStartsOn = 0): string {
  if (period === 'day') return localDate;
  if (period === 'month') return localDate.slice(0, 7);
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6)
    throw new Error('Week start must be a day from 0 through 6.');
  const offset = (parseDate(localDate).getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(localDate, -offset);
}

function emptyPeriodKeys(options: CompletionBucketOptions): string[] {
  if (options.from > options.to) throw new Error('Report start must not follow its end.');
  const keys = new Set<string>();
  for (let day = options.from; day <= options.to; day = addDays(day, 1))
    keys.add(periodKey(day, options.period, options.weekStartsOn));
  return [...keys];
}

function matchesScope(event: CompletionEvent, options: CompletionBucketOptions) {
  if (options.projectId === 'unassigned' && event.projectIdAtCompletion) return false;
  if (
    options.projectId &&
    options.projectId !== 'unassigned' &&
    event.projectIdAtCompletion !== options.projectId
  )
    return false;
  if (options.categoryId === 'unassigned' && event.categoryIdAtCompletion) return false;
  if (
    options.categoryId &&
    options.categoryId !== 'unassigned' &&
    event.categoryIdAtCompletion !== options.categoryId
  )
    return false;
  return true;
}

export function bucketCompletionEvents(
  events: readonly CompletionEvent[],
  options: CompletionBucketOptions,
) {
  assertIanaTimeZone(options.timeZone);
  const counts = new Map(emptyPeriodKeys(options).map((key) => [key, 0]));
  const urgencyCounts = zeroUrgencyCounts();
  for (const event of events) {
    if (!event.counted || event.completedBy.length === 0 || !matchesScope(event, options)) continue;
    if (!matchesUrgencySet(event.urgencyAtCompletion, options.urgencies)) continue;
    const localDate = localDateKey(event.occurredAt, options.timeZone);
    if (localDate < options.from || localDate > options.to) continue;
    const key = periodKey(localDate, options.period, options.weekStartsOn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    urgencyCounts[event.urgencyAtCompletion] += 1;
  }
  const buckets = [...counts].map(([key, count]) => ({ key, count }));
  return {
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    urgencyCounts,
  };
}
