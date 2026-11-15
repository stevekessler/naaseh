import { currencyExponentFor, forecastHistoryWindow, ulidSchema } from '@naaseh/domain';
import { z } from 'zod';

const timeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Finance time zone.');
const date = z.string().date();
const request = {
  dateFrom: date.optional(),
  dateTo: date.optional(),
  timeZone: timeZone.default('UTC'),
};

export const financeForecastRequestSchema = z
  .discriminatedUnion('method', [
    z
      .object({
        ...request,
        method: z.literal('known-plan'),
        includeNonBudgetedHistory: z.literal(false).default(false),
      })
      .strict(),
    z
      .object({
        ...request,
        method: z.literal('historical'),
        includeNonBudgetedHistory: z.boolean().default(false),
      })
      .strict(),
  ])
  .refine(
    ({ dateFrom, dateTo }) =>
      dateFrom === undefined ? dateTo === undefined : dateTo !== undefined && dateFrom <= dateTo,
    {
      message: 'Supply both dates in calendar order.',
    },
  );

const money = z.number().int().safe();
const flow = z
  .object({
    incomeMinor: money.nonnegative(),
    expenseMinor: money,
    netMinor: money,
  })
  .strict()
  .refine(({ incomeMinor, expenseMinor, netMinor }) => incomeMinor - expenseMinor === netMinor);
const currencyCode = /^[A-Z]{3}$/u;
const amounts = z
  .object({
    currency: z.string().regex(currencyCode),
    currencyExponent: z.number().int().min(0).max(4),
    actual: flow,
    remaining: flow.nullable(),
    projected: flow.nullable(),
  })
  .strict()
  .refine(
    ({ currency, currencyExponent, actual, remaining, projected }) =>
      currencyCode.test(currency) &&
      currencyExponentFor(currency) === currencyExponent &&
      (remaining === null
        ? projected === null
        : projected !== null &&
          projected.incomeMinor === actual.incomeMinor + remaining.incomeMinor &&
          projected.expenseMinor === actual.expenseMinor + remaining.expenseMinor),
  );
const window = z
  .object({
    dateFrom: date,
    dateTo: date,
    basis: z.enum(['budget', 'rolling', 'custom']),
  })
  .strict()
  .refine(({ dateFrom, dateTo }) => dateFrom <= dateTo);
const common = {
  budgetId: ulidSchema,
  window,
  asOfDate: date,
  timeZone,
  sourceAsOf: z.string().datetime(),
  sourceRevision: z.string().min(1).max(512),
  coverage: z.enum(['complete', 'partial']),
  currencies: z.array(amounts),
};
const observed = z
  .object({
    dateFrom: date,
    dateTo: date,
    coveredMonths: z.number().int().min(0).max(6),
  })
  .strict()
  .refine(({ dateFrom, dateTo }) => dateFrom <= dateTo);

export const financeForecastResultSchema = z
  .discriminatedUnion('method', [
    z
      .object({
        ...common,
        method: z.literal('known-plan'),
        status: z.literal('ready'),
        includeNonBudgetedHistory: z.literal(false),
      })
      .strict(),
    z
      .object({
        ...common,
        method: z.literal('historical'),
        status: z.enum(['ready', 'insufficient-history']),
        includeNonBudgetedHistory: z.boolean(),
        observed,
      })
      .strict(),
  ])
  .superRefine((result, context) => {
    if (result.method === 'historical') {
      let validWindow = false;
      try {
        const expected = forecastHistoryWindow(result.asOfDate);
        validWindow =
          expected.dateFrom === result.observed.dateFrom &&
          expected.dateTo === result.observed.dateTo;
      } catch {
        // The calculated lookback is outside supported calendar dates.
      }
      if (!validWindow)
        context.addIssue({
          code: 'custom',
          path: ['observed'],
          message: 'Forecast lookback is inconsistent.',
        });
    }
    const uniqueCurrencies = new Set(result.currencies.map(({ currency }) => currency));
    if (
      uniqueCurrencies.size !== result.currencies.length ||
      (result.method === 'known-plan' &&
        result.currencies.some(({ remaining }) => remaining === null)) ||
      (result.method === 'historical' &&
        result.coverage === 'complete' &&
        result.observed.coveredMonths !== 6) ||
      (result.status === 'insufficient-history' &&
        result.currencies.some(({ remaining }) => remaining !== null))
    )
      context.addIssue({
        code: 'custom',
        message: 'Forecast method, coverage or currency totals are inconsistent.',
      });
  });
