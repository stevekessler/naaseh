import { localFinanceDate } from '@naaseh/domain';
import { financeQueryFiltersSchema } from './finance.js';

export const spendReportDimensions = [
  'accountIds',
  'budgetIds',
  'merchantIds',
  'categoryIds',
  'subcategoryIds',
] as const;

export function spendReportMonth(timeZone: string, now = new Date()) {
  const month = localFinanceDate(now.toISOString(), timeZone).slice(0, 7);
  const start = new Date(month + '-01T00:00:00Z');
  start.setUTCMonth(start.getUTCMonth() + 1, 0);
  return { dateFrom: month + '-01', dateTo: start.toISOString().slice(0, 10) };
}

export function parseSpendReportFilters(params: URLSearchParams, now = new Date()) {
  const dates = Object.fromEntries(
    ['date', 'dateFrom', 'dateTo'].flatMap((key) =>
      params.has(key) ? [[key, params.get(key)]] : [],
    ),
  );
  const filters = financeQueryFiltersSchema.parse({
    postedSpendOnly: true,
    timeZone: params.get('timeZone') ?? 'UTC',
    ...dates,
    ...Object.fromEntries(
      spendReportDimensions.flatMap((key) => {
        const ids = [...new Set([...params.getAll(key), ...params.getAll(key + '[]')])].sort();
        return ids.length ? [[key, ids]] : [];
      }),
    ),
  });
  return Object.keys(dates).length
    ? filters
    : { ...filters, ...spendReportMonth(filters.timeZone, now) };
}
