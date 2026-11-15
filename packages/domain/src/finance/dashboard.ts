import { z } from 'zod';
import { ulidSchema } from '../primitives.js';

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

export const financeDashboardUpcomingCountSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
]);
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
