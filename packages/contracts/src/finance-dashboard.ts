import { z } from 'zod';
import {
  financeDashboardFlagSchema,
  financeDashboardSettingsSchema,
  financeDashboardUpcomingCountSchema,
} from '@naaseh/domain';

const expectedVersion = z.number().int().safe().nonnegative();

export const financeDashboardFlagUpdateSchema = z
  .object({ included: z.boolean(), expectedVersion: expectedVersion.optional() })
  .strict();

export const financeDashboardSettingsUpdateSchema = z
  .object({ upcomingCount: financeDashboardUpcomingCountSchema, expectedVersion })
  .strict();

export const financeDashboardPreferencesResponseSchema = z
  .object({ flags: z.array(financeDashboardFlagSchema), settings: financeDashboardSettingsSchema })
  .strict();

const dashboardId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
const dashboardDate = z.iso.date();
const minorUnits = z.number().int().safe();
const currency = z.string().regex(/^[A-Z]{3}$/u);

export const financeDashboardBudgetResponseSchema = z
  .object({
    id: dashboardId,
    name: z.string().min(1),
    startDate: dashboardDate,
    endDate: dashboardDate.optional(),
    items: z
      .array(
        z
          .object({
            id: dashboardId,
            currency,
            currencyExponent: z.number().int().min(0).max(4),
            plannedAmountMinor: minorUnits,
          })
          .strict(),
      )
      .max(100),
    accountIds: z.array(dashboardId).max(50),
    complete: z.boolean(),
  })
  .strict()
  .nullable();

export const financeSpendTrendRequestSchema = z
  .object({
    mode: z.enum(['month', 'quarter', 'year']),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    period: z.number().int().min(0).max(11),
    accountIds: z.array(dashboardId).min(1).max(50),
  })
  .strict();

export const financeSpendTrendResponseSchema = z
  .object({
    queryId: dashboardId,
    dateFrom: dashboardDate,
    dateTo: dashboardDate,
  })
  .strict();
