import {
  selectBudgetHistoryRows,
  type BudgetHistoryCandidate,
  type BudgetHistoryScope,
} from './forecast-history-scope.js';
import type { ForecastWindow } from './forecast-window.js';
import { addMinorUnits, currencyExponentFor } from './money.js';
import { isPostedSpendSource } from './refund.js';
import { buildSpendSlices, isFinanceDate, localFinanceDate, type SpendContext } from './spend.js';
import type { FinancialTransaction } from './transaction.js';

export interface ForecastActivity {
  id: string;
  date: string;
  kind: 'income' | 'expense';
  currency: string;
  /** Refunds are negative expense. Income must be explicitly classified and positive. */
  amountMinor: number;
}

export interface ForecastObligation {
  /** Canonical identity shared by a plan and any linked Upcoming Expense. */
  id: string;
  source: 'plan' | 'upcoming';
  dueDate: string;
  kind: ForecastActivity['kind'];
  currency: string;
  /** Remaining canonical principal after claims. A zero-valued successor also supersedes its plan. */
  remainingMinor: number;
}

interface ForecastInput {
  window: ForecastWindow;
  asOfDate: string;
  candidates: readonly BudgetHistoryCandidate<ForecastActivity>[];
  scope: BudgetHistoryScope;
  /** Completeness of the authorized actuals read itself, independently of assignment quality. */
  actualsComplete: boolean;
}
export type ForecastRequest = ForecastInput &
  (
    | {
        method: 'known-plan';
        obligations: readonly ForecastObligation[];
        obligationsComplete: boolean;
      }
    | { method: 'historical'; coveredHistoryMonths: readonly string[] }
  );

interface Flow {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}
interface CurrencyForecast {
  currency: string;
  currencyExponent: number;
  actual: Flow;
  remaining: Flow | null;
  projected: Flow | null;
}
interface ForecastResultBase {
  window: ForecastWindow;
  asOfDate: string;
  coverage: 'complete' | 'partial';
  currencies: CurrencyForecast[];
}

export type ForecastResult = ForecastResultBase &
  (
    | { method: 'known-plan'; status: 'ready'; includeNonBudgetedHistory: false }
    | {
        method: 'historical';
        status: 'ready' | 'insufficient-history';
        includeNonBudgetedHistory: boolean;
        observed: { dateFrom: string; dateTo: string; coveredMonths: number };
      }
  );

const flow = (incomeMinor = 0, expenseMinor = 0): Flow => ({
  incomeMinor,
  expenseMinor,
  netMinor: addMinorUnits([incomeMinor, -expenseMinor]),
});

/** Preserve posted-spend eligibility and require authoritative portions for genuine income. */
export function buildForecastActivity(
  transaction: FinancialTransaction,
  context: SpendContext,
  timeZone: string,
  classifiedIncome: readonly { id: string; amountMinor: number }[] = [],
): ForecastActivity[] {
  const slices = buildSpendSlices(transaction, context);
  if (!isPostedSpendSource(transaction)) return [];
  const date = localFinanceDate(transaction.effectiveAt, timeZone);
  if (slices.length)
    return slices.map((slice) => ({
      id: JSON.stringify([slice.transactionId, slice.originalAllocationId ?? null]),
      date,
      kind: 'expense',
      currency: slice.currency,
      amountMinor: slice.amountMinor,
    }));
  if (transaction.amountMinor <= 0 || context.refund?.status === 'active') return [];
  if (
    new Set(classifiedIncome.map(({ id }) => id)).size !== classifiedIncome.length ||
    classifiedIncome.some(({ id, amountMinor }) => !id || amountMinor <= 0) ||
    addMinorUnits(classifiedIncome.map(({ amountMinor }) => amountMinor)) > transaction.amountMinor
  )
    throw new Error('Forecast income portions must conserve the posted credit.');
  return classifiedIncome.map(({ id, amountMinor }) => ({
    id: JSON.stringify([transaction.id, id]),
    date,
    kind: 'income',
    currency: transaction.currency,
    amountMinor,
  }));
}

function collectTotals(rows: readonly ForecastActivity[]) {
  const totals = new Map<string, Flow>();
  const seen = new Map<string, string>();
  for (const { id, date, kind, currency, amountMinor } of rows) {
    const signature = JSON.stringify([date, kind, currency, amountMinor]);
    if (seen.has(id)) {
      if (seen.get(id) !== signature) throw new Error('Conflicting forecast activity identity.');
      continue;
    }
    if (
      !id ||
      !isFinanceDate(date) ||
      !Number.isSafeInteger(amountMinor) ||
      (kind === 'income' && amountMinor < 0)
    )
      throw new Error('Invalid forecast activity.');
    currencyExponentFor(currency);
    seen.set(id, signature);
    const current = totals.get(currency) ?? flow();
    totals.set(
      currency,
      kind === 'income'
        ? flow(addMinorUnits([current.incomeMinor, amountMinor]), current.expenseMinor)
        : flow(current.incomeMinor, addMinorUnits([current.expenseMinor, amountMinor])),
    );
  }
  return totals;
}

function remainingPlans(
  obligations: readonly ForecastObligation[],
  window: ForecastWindow,
  asOfDate: string,
) {
  const byId = new Map<string, ForecastObligation>();
  const sources = new Map<string, string>();
  for (const obligation of obligations) {
    if (
      !obligation.id ||
      !isFinanceDate(obligation.dueDate) ||
      !Number.isSafeInteger(obligation.remainingMinor) ||
      obligation.remainingMinor < 0
    )
      throw new Error('Invalid forecast obligation.');
    currencyExponentFor(obligation.currency);
    const key = JSON.stringify([obligation.id, obligation.source]);
    const signature = JSON.stringify([
      obligation.kind,
      obligation.currency,
      obligation.dueDate,
      obligation.remainingMinor,
    ]);
    if (sources.has(key) && sources.get(key) !== signature)
      throw new Error('Conflicting forecast obligation source.');
    sources.set(key, signature);
    const prior = byId.get(obligation.id);
    if (prior && (prior.currency !== obligation.currency || prior.kind !== obligation.kind))
      throw new Error('Forecast obligation direction or currency changed.');
    if (!prior || obligation.source === 'upcoming') byId.set(obligation.id, obligation);
  }
  return collectTotals(
    [...byId.values()].flatMap(({ id, dueDate, remainingMinor, kind, currency }) => {
      const date = dueDate < asOfDate ? asOfDate : dueDate;
      return remainingMinor && date >= window.dateFrom && date <= window.dateTo
        ? [{ id, date, kind, currency, amountMinor: remainingMinor }]
        : [];
    }),
  );
}

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function monthFromIndex(index: number) {
  return (
    String(Math.floor(index / 12)).padStart(4, '0') +
    '-' +
    String((index % 12) + 1).padStart(2, '0')
  );
}

function daysInMonth(index: number) {
  const date = new Date(monthFromIndex(index) + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}

/** The canonical reader can bound its historical source query to these six closed months. */
export function forecastHistoryWindow(asOfDate: string) {
  if (!isFinanceDate(asOfDate)) throw new RangeError('Invalid forecast date.');
  const first = monthIndex(asOfDate) - 6;
  if (first < 12) throw new RangeError('Forecast lookback exceeds supported calendar dates.');
  const months = Array.from({ length: 6 }, (_, index) => monthFromIndex(first + index));
  return {
    dateFrom: months[0]! + '-01',
    dateTo: months[5]! + '-' + String(daysInMonth(first + 5)),
    months,
  };
}

function followingDay(isoDate: string) {
  if (isoDate === '9999-12-31') return undefined;
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Prorate by calendar days at either end; a complete month has weight one.
function monthWeight(from: string, to: string) {
  const start = monthIndex(from);
  const end = monthIndex(to);
  const firstDay = Number(from.slice(-2));
  const lastDay = Number(to.slice(-2));
  const startDays = BigInt(daysInMonth(start));
  if (start === end) return [BigInt(lastDay - firstDay + 1), startDays] as const;
  const endDays = BigInt(daysInMonth(end));
  return [
    BigInt(end - start - 1) * startDays * endDays +
      (startDays - BigInt(firstDay) + 1n) * endDays +
      BigInt(lastDay) * startDays,
    startDays * endDays,
  ] as const;
}

function scaleMinor(amount: number, numerator: bigint, denominator: bigint) {
  const scaled = BigInt(Math.abs(amount)) * numerator;
  const rounded = (scaled * 2n + denominator) / (2n * denominator);
  const value = Number(amount < 0 ? -rounded : rounded);
  if (!Number.isSafeInteger(value)) throw new RangeError('Forecast exceeds safe minor units.');
  return value;
}

function combineCurrencies(
  actual: Map<string, Flow>,
  remaining: Map<string, Flow>,
  allowZero: boolean,
): CurrencyForecast[] {
  return [...new Set([...actual.keys(), ...remaining.keys()])].sort().map((currency) => {
    const earned = actual.get(currency) ?? flow();
    const forecast = remaining.get(currency) ?? (allowZero ? flow() : null);
    return {
      currency,
      currencyExponent: currencyExponentFor(currency),
      actual: earned,
      remaining: forecast,
      projected: forecast
        ? flow(
            addMinorUnits([earned.incomeMinor, forecast.incomeMinor]),
            addMinorUnits([earned.expenseMinor, forecast.expenseMinor]),
          )
        : null,
    };
  });
}

export function calculateBudgetForecast(input: ForecastRequest): ForecastResult {
  const { scope, window, asOfDate } = input;
  if (
    ![window.dateFrom, window.dateTo, asOfDate].every(isFinanceDate) ||
    window.dateFrom > window.dateTo
  )
    throw new RangeError('Invalid forecast dates.');
  if (!scope.authorizedBudgetIds.has(scope.budgetId))
    throw new Error('Forecast budget is unavailable.');
  const actual = selectBudgetHistoryRows(
    input.candidates.filter(
      ({ value }) =>
        value.date >= window.dateFrom && value.date <= window.dateTo && value.date <= asOfDate,
    ),
    { ...scope, includeNonBudgetedHistory: false },
  );
  const actualTotals = collectTotals(actual.budgetRows);
  const actualsComplete = input.actualsComplete && actual.inputsComplete;
  const base = { window, asOfDate };
  if (input.method === 'known-plan') {
    const remaining = remainingPlans(input.obligations, window, asOfDate);
    return {
      ...base,
      method: 'known-plan',
      includeNonBudgetedHistory: false,
      status: 'ready',
      coverage: actualsComplete && input.obligationsComplete ? 'complete' : 'partial',
      currencies: combineCurrencies(actualTotals, remaining, true),
    };
  }

  const { dateFrom, dateTo, months } = forecastHistoryWindow(asOfDate);
  const covered = new Set(months.filter((month) => input.coveredHistoryMonths.includes(month)));
  const history = selectBudgetHistoryRows(
    input.candidates.filter(({ value }) => covered.has(value.date.slice(0, 7))),
    scope,
  );
  const historical = [...history.budgetRows, ...history.nonBudgetedRows];
  const historicalTotals = collectTotals(historical);
  const activeMonths = new Map<string, Set<string>>();
  for (const row of historical) {
    const active = activeMonths.get(row.currency) ?? new Set<string>();
    active.add(row.date.slice(0, 7));
    activeMonths.set(row.currency, active);
  }
  const nextDay = followingDay(asOfDate);
  const start = nextDay && (nextDay > window.dateFrom ? nextDay : window.dateFrom);
  const weight = start && start <= window.dateTo ? monthWeight(start, window.dateTo) : undefined;
  const remaining = new Map<string, Flow>();
  if (weight) {
    const [numerator, denominator] = weight;
    const divisor = denominator * BigInt(covered.size);
    for (const [currency, totals] of historicalTotals) {
      if ((activeMonths.get(currency)?.size ?? 0) < 3) continue;
      remaining.set(
        currency,
        flow(
          scaleMinor(totals.incomeMinor, numerator, divisor),
          scaleMinor(totals.expenseMinor, numerator, divisor),
        ),
      );
    }
  }
  return {
    ...base,
    method: 'historical',
    includeNonBudgetedHistory: scope.includeNonBudgetedHistory === true,
    observed: { dateFrom, dateTo, coveredMonths: covered.size },
    status: weight && !remaining.size ? 'insufficient-history' : 'ready',
    coverage:
      actualsComplete && history.inputsComplete && covered.size === 6 ? 'complete' : 'partial',
    currencies: combineCurrencies(actualTotals, remaining, !weight),
  };
}
