export interface DashboardPeriod {
  start: string;
  end: string;
  comparisonStart: string;
  comparisonEnd: string;
}
export type JournalDashboardMetricName =
  | 'daysJournaled'
  | 'suicidalThoughts'
  | 'suicidalBehaviors'
  | 'selfHarmThoughts'
  | 'selfHarmBehaviors'
  | 'hoursOfSleep'
  | 'urgeToAvoidCommitments'
  | 'medicationsAsPrescribed'
  | 'conflictWithOthers'
  | 'balancedEating'
  | 'selfCare'
  | 'anger'
  | 'fear'
  | 'anxiety'
  | 'pain'
  | 'sadness'
  | 'shame'
  | 'guilt'
  | 'loneliness'
  | 'joy'
  | 'contentment';
export interface JournalDashboardMetric {
  metric: JournalDashboardMetricName;
  kind: 'dayCount' | 'yesDayCount' | 'average';
  value: number | 'noData';
  comparisonValue: number | 'noData';
  trend: 'up' | 'down' | 'unchanged' | 'notComparable';
  contributingEntryIds: string[];
}
type DashboardEntry = {
  id: string;
  date: string;
  emotions?: Record<string, number | null>;
  [key: string]: unknown;
};

const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
};
const formatDate = (value: Date) => value.toISOString().slice(0, 10);
export function buildDashboardPeriod(start: string, end: string): DashboardPeriod {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (startDate > endDate) throw new Error('Start date must be on or before end date.');
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const comparisonEnd = new Date(startDate);
  comparisonEnd.setUTCDate(comparisonEnd.getUTCDate() - 1);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setUTCDate(comparisonStart.getUTCDate() - days + 1);
  return {
    start,
    end,
    comparisonStart: formatDate(comparisonStart),
    comparisonEnd: formatDate(comparisonEnd),
  };
}
const definitions: Array<{
  metric: JournalDashboardMetricName;
  kind: JournalDashboardMetric['kind'];
  field?: string;
  sensitive?: boolean;
}> = [
  { metric: 'daysJournaled', kind: 'dayCount' },
  { metric: 'suicidalThoughts', kind: 'average', sensitive: true },
  { metric: 'suicidalBehaviors', kind: 'yesDayCount', sensitive: true },
  { metric: 'selfHarmThoughts', kind: 'average', sensitive: true },
  { metric: 'selfHarmBehaviors', kind: 'yesDayCount', sensitive: true },
  { metric: 'hoursOfSleep', kind: 'average' },
  { metric: 'urgeToAvoidCommitments', kind: 'average' },
  { metric: 'medicationsAsPrescribed', kind: 'yesDayCount' },
  { metric: 'conflictWithOthers', kind: 'yesDayCount' },
  { metric: 'balancedEating', kind: 'yesDayCount' },
  { metric: 'selfCare', kind: 'yesDayCount' },
  ...(
    [
      'anger',
      'fear',
      'anxiety',
      'pain',
      'sadness',
      'shame',
      'guilt',
      'loneliness',
      'joy',
      'contentment',
    ] as const
  ).map((metric) => ({ metric, kind: 'average' as const, field: `emotions.${metric}` })),
];
const fieldValue = (entry: DashboardEntry, field: string) =>
  field.startsWith('emotions.') ? entry.emotions?.[field.slice(9)] : entry[field];
const aggregate = (entries: DashboardEntry[], definition: (typeof definitions)[number]) => {
  if (definition.kind === 'dayCount')
    return {
      value: new Set(entries.map((entry) => entry.date)).size,
      ids: entries.map((entry) => entry.id),
    };
  const answered = entries.filter(
    (entry) =>
      fieldValue(entry, definition.field ?? definition.metric) !== null &&
      fieldValue(entry, definition.field ?? definition.metric) !== undefined,
  );
  if (!answered.length) return { value: 'noData' as const, ids: [] };
  if (definition.kind === 'yesDayCount')
    return {
      value: new Set(
        answered
          .filter((entry) => fieldValue(entry, definition.field ?? definition.metric) === true)
          .map((entry) => entry.date),
      ).size,
      ids: answered.map((entry) => entry.id),
    };
  return {
    value:
      answered.reduce(
        (sum, entry) => sum + Number(fieldValue(entry, definition.field ?? definition.metric)),
        0,
      ) / answered.length,
    ids: answered.map((entry) => entry.id),
  };
};
export function calculateJournalDashboard(
  entries: DashboardEntry[],
  selected: { start: string; end: string },
  profile: { suicidalSelfHarmEnabled: boolean },
): JournalDashboardMetric[] {
  const period = buildDashboardPeriod(selected.start, selected.end);
  const current = entries.filter((entry) => entry.date >= period.start && entry.date <= period.end);
  const comparison = entries.filter(
    (entry) => entry.date >= period.comparisonStart && entry.date <= period.comparisonEnd,
  );
  return definitions
    .filter((definition) => !definition.sensitive || profile.suicidalSelfHarmEnabled)
    .map((definition) => {
      const value = aggregate(current, definition);
      const prior = aggregate(comparison, definition);
      const trend =
        value.value === 'noData' || prior.value === 'noData'
          ? 'notComparable'
          : value.value > prior.value
            ? 'up'
            : value.value < prior.value
              ? 'down'
              : 'unchanged';
      return {
        metric: definition.metric,
        kind: definition.kind,
        value: value.value,
        comparisonValue: prior.value,
        trend,
        contributingEntryIds: value.ids,
      };
    });
}
