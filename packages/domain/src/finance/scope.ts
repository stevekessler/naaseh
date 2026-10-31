import { z } from 'zod';
import { ulidSchema } from '../primitives.js';

export const financeScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('owner'), ownerId: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('group'), groupId: ulidSchema }).strict(),
]);

export type FinanceScope = z.infer<typeof financeScopeSchema>;
export type FinanceAudience = `OWNER#${string}` | `GROUP#${string}`;

export function financeAudience(scope: FinanceScope): FinanceAudience {
  return scope.type === 'owner' ? `OWNER#${scope.ownerId}` : `GROUP#${scope.groupId}`;
}
