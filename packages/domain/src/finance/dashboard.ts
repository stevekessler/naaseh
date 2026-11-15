import { z } from 'zod';
import { ulidSchema } from '../primitives.js';
import {
  plannedSourceIdentity,
  type UpcomingExpense,
  type UpcomingExpenseDisplayState,
} from './upcoming-expense.js';

export const financeDashboardTargetKindSchema = z.enum([
  'account',
  'budget',
  'category',
  'merchant',
]);
export type FinanceDashboardTargetKind = z.infer<typeof financeDashboardTargetKindSchema>;

export const financeDashboardTargetSchema = z
  .object({ targetKind: financeDashboardTargetKindSchema, targetId: ulidSchema })
  .strict();
export type FinanceDashboardTarget = z.infer<typeof financeDashboardTargetSchema>;

export const financeDashboardUpcomingCounts = [5, 10, 15, 20] as const;
export const financeDashboardUpcomingCountSchema = z.literal(financeDashboardUpcomingCounts);
export type FinanceDashboardUpcomingCount = z.infer<typeof financeDashboardUpcomingCountSchema>;

export const financeDashboardSettingsSchema = z
  .object({
    upcomingCount: financeDashboardUpcomingCountSchema,
    version: z.number().int().safe().nonnegative(),
  })
  .strict();
export const defaultFinanceDashboardSettings = { upcomingCount: 10, version: 0 } as const;

export const financeDashboardFlagSchema = financeDashboardTargetSchema
  .extend({ included: z.boolean(), version: z.number().int().safe().positive() })
  .strict();

/** Select only from the authorized expense views supplied by the caller. */
export function selectDashboardUpcoming<
  T extends {
    expense: Pick<UpcomingExpense, 'id' | 'version' | 'dueDate' | 'plannedSource'>;
    state: UpcomingExpenseDisplayState;
  },
>(items: readonly T[], limit: FinanceDashboardUpcomingCount) {
  const latestById = new Map<string, T>();
  for (const item of items) {
    const previous = latestById.get(item.expense.id);
    if (!previous || item.expense.version > previous.expense.version)
      latestById.set(item.expense.id, item);
  }
  const canonical = new Map<string, T>();
  for (const item of latestById.values()) {
    if (item.state === 'paid' || item.state === 'cancelled') continue;
    const { id, plannedSource, version } = item.expense;
    const key = plannedSource ? plannedSourceIdentity(plannedSource) : `expense:${id}`;
    const previous = canonical.get(key)?.expense;
    if (
      !previous ||
      version > previous.version ||
      (version === previous.version && id < previous.id)
    )
      canonical.set(key, item);
  }
  const ordered = [...canonical.values()].sort(
    (left, right) =>
      left.expense.dueDate.localeCompare(right.expense.dueDate) ||
      left.expense.id.localeCompare(right.expense.id),
  );
  const overdue = (item: T) => item.state === 'overdue' || item.state === 'partly-paid-overdue';
  return {
    upcoming: ordered.filter((item) => !overdue(item)).slice(0, limit),
    overdue: ordered.filter(overdue),
  };
}
