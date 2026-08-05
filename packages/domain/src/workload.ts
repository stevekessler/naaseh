import { z } from 'zod';
import { urgencyCountsSchema, zeroUrgencyCounts } from './urgency.js';

export type WorkloadLifecycle = 'active' | 'archived' | 'deleting' | undefined;

export const workloadCountsSchema = z
  .object({
    tasks: z.number().int().nonnegative(),
    lists: z.number().int().nonnegative(),
    urgencyCounts: urgencyCountsSchema,
  })
  .strict();

export type WorkloadCounts = z.infer<typeof workloadCountsSchema>;

export const zeroWorkloadCounts = (): WorkloadCounts => ({
  tasks: 0,
  lists: 0,
  urgencyCounts: zeroUrgencyCounts(),
});

export const includeInWorkload = (work: { lifecycle?: WorkloadLifecycle }) =>
  (work.lifecycle ?? 'active') === 'active';

export function workloadScopes(projectId?: string, categoryId?: string) {
  if (!projectId) return [{ type: 'unassigned' as const, id: 'unassigned' }];
  return [
    { type: 'project' as const, id: projectId },
    ...(categoryId ? [{ type: 'category' as const, id: categoryId }] : []),
  ];
}
