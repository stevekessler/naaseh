export interface CompletionPeriod {
  key: string;
  count: number;
}

export type CompletionChartProjection =
  | { kind: 'ready'; visiblePeriods: CompletionPeriod[]; maximum: number }
  | { kind: 'empty'; emptyReason: 'filtered' | 'range' }
  | { kind: 'invalid'; error: 'calculation_failed' };

export function projectCompletionChart(
  rawPeriods: unknown,
  hasActiveFilters: boolean,
): CompletionChartProjection {
  if (!Array.isArray(rawPeriods)) return { kind: 'invalid', error: 'calculation_failed' };

  const keys = new Set<string>();
  const periods: CompletionPeriod[] = [];
  for (const candidate of rawPeriods) {
    if (!candidate || typeof candidate !== 'object')
      return { kind: 'invalid', error: 'calculation_failed' };
    const { key, count } = candidate as Record<string, unknown>;
    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      keys.has(key) ||
      typeof count !== 'number' ||
      !Number.isFinite(count) ||
      !Number.isInteger(count) ||
      count < 0
    )
      return { kind: 'invalid', error: 'calculation_failed' };
    keys.add(key);
    periods.push(candidate as CompletionPeriod);
  }

  const visiblePeriods = periods.filter(({ count }) => count > 0);
  if (visiblePeriods.length === 0)
    return { kind: 'empty', emptyReason: hasActiveFilters ? 'filtered' : 'range' };

  return {
    kind: 'ready',
    visiblePeriods,
    maximum: Math.max(...visiblePeriods.map(({ count }) => count)),
  };
}
