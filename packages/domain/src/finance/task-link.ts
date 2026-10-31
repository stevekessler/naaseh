import { z } from 'zod';
import { ulidSchema } from '../primitives.js';

export const financialTaskLinkSchema = z
  .object({
    id: ulidSchema,
    budgetId: ulidSchema,
    budgetItemId: ulidSchema,
    taskId: ulidSchema,
    financeAudience: z.string().regex(/^GROUP#[^#]+$/u),
    createdBy: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(['active', 'removed']),
    version: z.number().int().positive(),
  })
  .strict();

export type FinancialTaskLink = z.infer<typeof financialTaskLinkSchema>;

export function createFinancialTaskLink(input: {
  id: string;
  budgetId: string;
  budgetItemId: string;
  taskId: string;
  groupId: string;
  createdBy: string;
  now?: Date;
}): FinancialTaskLink {
  const timestamp = (input.now ?? new Date()).toISOString();
  return financialTaskLinkSchema.parse({
    id: input.id,
    budgetId: input.budgetId,
    budgetItemId: input.budgetItemId,
    taskId: input.taskId,
    financeAudience: `GROUP#${input.groupId}`,
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'active',
    version: 1,
  });
}

/** Removal is a durable tombstone so task and budget history never lose relationship evidence. */
export function removeFinancialTaskLink(
  link: FinancialTaskLink,
  now = new Date(),
): FinancialTaskLink {
  if (link.status === 'removed') return link;
  return financialTaskLinkSchema.parse({
    ...link,
    status: 'removed',
    updatedAt: now.toISOString(),
    version: link.version + 1,
  });
}

/** A relationship may be decorated only after both independent access checks succeed. */
export function canRevealFinancialTaskLink(input: {
  link: FinancialTaskLink;
  canReadTask: boolean;
  canReadFinance: boolean;
}): boolean {
  return input.link.status === 'active' && input.canReadTask && input.canReadFinance;
}
