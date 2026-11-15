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
