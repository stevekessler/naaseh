import { z } from 'zod';
import { ulidSchema } from './primitives.js';
import { urgencySchema } from './urgency.js';

export const completionEventSchema = z
  .object({
    id: ulidSchema,
    taskId: ulidSchema,
    completedBy: z.string().min(1),
    occurredAt: z.string().datetime(),
    urgencyAtCompletion: urgencySchema,
    projectIdAtCompletion: ulidSchema.optional(),
    projectNameAtCompletion: z.string().trim().min(1).max(80).optional(),
    categoryIdAtCompletion: ulidSchema.optional(),
    categoryNameAtCompletion: z.string().trim().min(1).max(80).optional(),
    counted: z.boolean(),
    reversedAt: z.string().datetime().optional(),
    reversedBy: z.string().min(1).optional(),
    reversalMutationId: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine((event, context) => {
    const hasProject = Boolean(event.projectIdAtCompletion && event.projectNameAtCompletion);
    const hasCategory = Boolean(event.categoryIdAtCompletion && event.categoryNameAtCompletion);
    if (hasProject !== hasCategory)
      context.addIssue({
        code: 'custom',
        path: ['projectIdAtCompletion'],
        message: 'Historical Project and Category attribution must be complete together.',
      });
    const reversed = Boolean(event.reversedAt && event.reversedBy && event.reversalMutationId);
    if (event.counted === reversed)
      context.addIssue({
        code: 'custom',
        path: ['counted'],
        message: 'Counted events cannot be reversed; uncounted events require reversal metadata.',
      });
  });

export type CompletionEvent = z.infer<typeof completionEventSchema>;

export function reverseCompletionEvent(
  event: CompletionEvent,
  actorId: string,
  mutationId: string,
  now = new Date(),
): CompletionEvent {
  if (!event.counted) throw new Error('Completion event is already reversed.');
  return completionEventSchema.parse({
    ...event,
    counted: false,
    reversedAt: now.toISOString(),
    reversedBy: actorId,
    reversalMutationId: mutationId,
  });
}
