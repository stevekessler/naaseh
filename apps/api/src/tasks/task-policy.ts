import type { Task } from '@naaseh/domain';
export function safeTaskUrl(value: string | undefined): string | undefined {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Task links must use HTTPS.');
  return url.toString();
}
export function assertNoCycle(
  taskId: string,
  parentId: string | undefined,
  tasks: Map<string, Task>,
): void {
  const seen = new Set([taskId]);
  let cursor = parentId;
  while (cursor) {
    if (seen.has(cursor)) throw new Error('A task cannot be its own ancestor.');
    seen.add(cursor);
    cursor = tasks.get(cursor)?.parentId;
  }
}
export const completionPatch = (completed: boolean) => ({
  status: completed ? ('completed' as const) : ('open' as const),
});
export function applyCategoryDefaults(
  input: Partial<Task>,
  category: { defaultAssigneeId?: string | undefined } | undefined,
) {
  return {
    ...input,
    ...(!input.assigneeId && category?.defaultAssigneeId
      ? { assigneeId: category.defaultAssigneeId }
      : {}),
  };
}
