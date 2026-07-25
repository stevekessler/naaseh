export type WorkloadLifecycle = 'active' | 'archived' | 'deleting' | undefined;

export const includeInWorkload = (work: { lifecycle?: WorkloadLifecycle }) =>
  (work.lifecycle ?? 'active') === 'active';

export function workloadScopes(projectId?: string, categoryId?: string) {
  if (!projectId) return [{ type: 'unassigned' as const, id: 'unassigned' }];
  return [
    { type: 'project' as const, id: projectId },
    ...(categoryId ? [{ type: 'category' as const, id: categoryId }] : []),
  ];
}
