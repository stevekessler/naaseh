import { z } from 'zod';

export const financeLifecycleSchema = z.enum([
  'active',
  'attention',
  'archived',
  'deleting',
  'tombstone',
]);
export type FinanceLifecycle = z.infer<typeof financeLifecycleSchema>;

const transitions: Record<FinanceLifecycle, ReadonlySet<FinanceLifecycle>> = {
  active: new Set(['attention', 'archived', 'deleting']),
  attention: new Set(['active', 'archived', 'deleting']),
  archived: new Set(['active', 'tombstone']),
  deleting: new Set(['archived', 'tombstone']),
  tombstone: new Set(),
};

export function assertFinanceTransition(
  current: FinanceLifecycle,
  next: FinanceLifecycle,
): FinanceLifecycle {
  if (current === next) return next;
  if (!transitions[current].has(next)) {
    throw new Error(`Invalid Finance lifecycle transition from ${current} to ${next}.`);
  }
  return next;
}
