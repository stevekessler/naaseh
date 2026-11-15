import { z } from 'zod';
import { ulidSchema } from '../primitives.js';

export const financialTaskTargetTypeSchema = z.enum([
  'budgetItem',
  'transaction',
  'upcomingExpense',
]);
export type FinancialTaskTargetType = z.infer<typeof financialTaskTargetTypeSchema>;

const commonFields = {
  id: ulidSchema,
  taskId: ulidSchema,
  financeAudience: z.string().regex(/^(?:OWNER|GROUP)#[^#]+$/u),
  createdBy: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(['active', 'removed']),
  version: z.number().int().positive(),
};

const canonicalFinancialTaskLinkSchema = z
  .object({
    ...commonFields,
    targetType: financialTaskTargetTypeSchema,
    targetId: ulidSchema,
    budgetId: ulidSchema.optional(),
    /** Retained on budget-item rows for v1 clients and encrypted-cache migration. */
    budgetItemId: ulidSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetType === 'budgetItem' && !value.budgetId)
      context.addIssue({
        code: 'custom',
        path: ['budgetId'],
        message: 'Budget-item links require their budget identity.',
      });
    if (
      value.targetType === 'budgetItem' &&
      value.budgetItemId !== undefined &&
      value.budgetItemId !== value.targetId
    )
      context.addIssue({
        code: 'custom',
        path: ['budgetItemId'],
        message: 'Legacy budget-item identity must match the canonical target.',
      });
    if (value.targetType !== 'budgetItem' && value.budgetId)
      context.addIssue({
        code: 'custom',
        path: ['budgetId'],
        message: 'Only budget-item links carry a budget identity.',
      });
    if (value.targetType !== 'budgetItem' && value.budgetItemId)
      context.addIssue({
        code: 'custom',
        path: ['budgetItemId'],
        message: 'Only budget-item links carry a legacy budget-item identity.',
      });
  });

const legacyFinancialTaskLinkSchema = z
  .object({
    ...commonFields,
    budgetId: ulidSchema,
    budgetItemId: ulidSchema,
  })
  .strict();

export type FinancialTaskLink = z.infer<typeof canonicalFinancialTaskLinkSchema>;
export type LegacyFinancialTaskLink = z.infer<typeof legacyFinancialTaskLinkSchema>;

/** Losslessly maps the v1 budget-item fields onto the v2 target identity. */
export function adaptLegacyFinancialTaskLink(
  value: FinancialTaskLink | LegacyFinancialTaskLink,
): FinancialTaskLink {
  if ('targetType' in value) return canonicalFinancialTaskLinkSchema.parse(value);
  const { budgetItemId, ...legacy } = value;
  return canonicalFinancialTaskLinkSchema.parse({
    ...legacy,
    targetType: 'budgetItem',
    targetId: budgetItemId,
    budgetItemId,
  });
}

export const financialTaskLinkSchema = z
  .union([canonicalFinancialTaskLinkSchema, legacyFinancialTaskLinkSchema])
  .transform(adaptLegacyFinancialTaskLink);

export type FinancialTaskTarget =
  | { targetType: 'budgetItem'; targetId: string; budgetId: string }
  | { targetType: 'transaction'; targetId: string }
  | { targetType: 'upcomingExpense'; targetId: string };

export function financialTaskLinkPairKey(
  taskId: string,
  targetType: FinancialTaskTargetType,
  targetId: string,
) {
  ulidSchema.parse(taskId);
  financialTaskTargetTypeSchema.parse(targetType);
  ulidSchema.parse(targetId);
  return `${taskId}#${targetType}#${targetId}`;
}

type CommonCreateInput = {
  id: string;
  taskId: string;
  createdBy: string;
  now?: Date;
};

export function createFinancialTaskLink(
  input:
    | (CommonCreateInput & {
        target: FinancialTaskTarget;
        financeAudience: `OWNER#${string}` | `GROUP#${string}`;
      })
    | (CommonCreateInput & {
        budgetId: string;
        budgetItemId: string;
        groupId: string;
      }),
): FinancialTaskLink {
  const timestamp = (input.now ?? new Date()).toISOString();
  const target: FinancialTaskTarget =
    'target' in input
      ? input.target
      : { targetType: 'budgetItem', targetId: input.budgetItemId, budgetId: input.budgetId };
  const financeAudience =
    'financeAudience' in input ? input.financeAudience : (`GROUP#${input.groupId}` as const);
  return canonicalFinancialTaskLinkSchema.parse({
    id: input.id,
    taskId: input.taskId,
    ...target,
    ...(target.targetType === 'budgetItem' ? { budgetItemId: target.targetId } : {}),
    financeAudience,
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'active',
    version: 1,
  });
}

/** Removal is a durable tombstone so task and Finance history retain relationship evidence. */
export function removeFinancialTaskLink(
  link: FinancialTaskLink,
  now = new Date(),
): FinancialTaskLink {
  if (link.status === 'removed') return link;
  return canonicalFinancialTaskLinkSchema.parse({
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
