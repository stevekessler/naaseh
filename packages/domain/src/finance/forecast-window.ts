import { isFinanceDate } from './spend.js';

interface ForecastDateRange {
  dateFrom: string;
  dateTo: string;
}

interface ForecastWindowInput {
  budgetStart: string;
  budgetEnd?: string | null;
  asOfDate: string;
  custom?: ForecastDateRange;
}

export interface ForecastWindow extends ForecastDateRange {
  basis: 'budget' | 'rolling' | 'custom';
}

/** Resolve inclusive calendar dates without using the host clock or time zone. */
export function resolveForecastWindow(input: ForecastWindowInput): ForecastWindow {
  const { budgetStart, budgetEnd, asOfDate, custom } = input;
  if (
    !isFinanceDate(budgetStart) ||
    !isFinanceDate(asOfDate) ||
    (budgetEnd != null && (!isFinanceDate(budgetEnd) || budgetEnd < budgetStart))
  ) {
    throw new RangeError('Invalid forecast budget dates or reference date');
  }
  if (custom) {
    const { dateFrom, dateTo } = custom;
    if (!isFinanceDate(dateFrom) || !isFinanceDate(dateTo) || dateFrom > dateTo) {
      throw new RangeError('Invalid custom forecast dates');
    }
    return { dateFrom, dateTo, basis: 'custom' };
  }
  if (budgetEnd != null) {
    return { dateFrom: budgetStart, dateTo: budgetEnd, basis: 'budget' };
  }

  const dateFrom = budgetStart > asOfDate ? budgetStart : asOfDate;
  const anniversary = new Date(`${dateFrom}T00:00:00Z`);
  const startMonth = anniversary.getUTCMonth();
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (anniversary.getUTCMonth() !== startMonth) {
    anniversary.setUTCDate(0);
  }
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  const isoEnd = anniversary.toISOString();
  const dateTo = isoEnd.slice(0, isoEnd.indexOf('T'));
  if (!isFinanceDate(dateTo)) {
    throw new RangeError('Rolling forecast exceeds supported calendar dates');
  }
  return { dateFrom, dateTo, basis: 'rolling' };
}
