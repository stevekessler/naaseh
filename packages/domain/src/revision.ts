import { z } from 'zod';
import { ulidSchema } from './primitives.js';
import { entityTypeSchema } from './sync.js';
import { urgencySchema } from './urgency.js';
import type { Task } from './task.js';

export const revisionOperationSchema = z.enum([
  'create',
  'update',
  'patch',
  'complete',
  'reopen',
  'archive',
  'restore',
  'privacy',
  'conflict-resolve',
  'delete',
  'lock',
  'unlock',
  'resetOverrides',
  'reorder',
  'releaseAttachment',
  'completeAndArchive',
  'reopenAndRestore',
  'finish',
  'assignProject',
  'archiveOrganization',
  'restoreOrganization',
]);

export const revisionSyncOutcomeSchema = z.enum(['local-pending', 'applied', 'replayed', 'merged']);
export const revisionValuesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .superRefine((values, context) => {
    if ('urgency' in values && !urgencySchema.safeParse(values.urgency).success)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['urgency'],
        message: 'Revision urgency must be categorical.',
      });
  });

export const taskRevisionSchema = z
  .object({
    id: ulidSchema,
    taskId: ulidSchema,
    mutationId: ulidSchema.optional(),
    sourceClientId: ulidSchema.optional(),
    actorId: z.string().min(1),
    version: z.number().int().positive(),
    changedAt: z.string().datetime(),
    operation: revisionOperationSchema,
    changedFields: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).max(50),
    before: revisionValuesSchema.optional(),
    after: revisionValuesSchema.default({}),
    syncOutcome: revisionSyncOutcomeSchema.default('applied'),
    conflictResolution: z
      .object({ sourceVersions: z.array(z.number().int().positive()), strategy: z.string().min(1) })
      .optional(),
  })
  .strict();

export type TaskRevision = z.infer<typeof taskRevisionSchema>;

export const entityRevisionSchema = z
  .object({
    id: ulidSchema,
    entityType: entityTypeSchema,
    entityId: ulidSchema,
    mutationId: ulidSchema.optional(),
    sourceClientId: ulidSchema.optional(),
    actorId: z.string().min(1),
    version: z.number().int().positive(),
    changedAt: z.string().datetime(),
    operation: revisionOperationSchema,
    changedFields: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).max(50),
    before: revisionValuesSchema.optional(),
    after: revisionValuesSchema.default({}),
    syncOutcome: revisionSyncOutcomeSchema.default('applied'),
    conflictResolution: z
      .object({ sourceVersions: z.array(z.number().int().positive()), strategy: z.string().min(1) })
      .optional(),
  })
  .strict();

export type EntityRevision = z.infer<typeof entityRevisionSchema>;

const taskRevisionFields = [
  'label',
  'memo',
  'memoDocument',
  'memoHidden',
  'link',
  'dueAt',
  'dueKind',
  'dueDate',
  'dueTimeZone',
  'repeatInterval',
  'repeatUnit',
  'assigneeId',
  'categoryId',
  'projectId',
  'groupId',
  'parentId',
  'visibility',
  'urgency',
  'postItColor',
  'percentComplete',
  'status',
  'completedAt',
  'completedBy',
  'lifecycle',
  'completionState',
  'archiveReason',
  'archivedAt',
  'archivedBy',
  'currentCompletionEventId',
] as const satisfies readonly (keyof Task)[];

export function taskRevisionChanges(task: Task, previous?: Task) {
  const changedFields: string[] = [];
  const before: TaskRevision['after'] = {};
  const after: TaskRevision['after'] = {};
  for (const field of taskRevisionFields) {
    const value = (snapshot: Task | undefined) =>
      field === 'memoDocument'
        ? snapshot?.memoDocument && JSON.stringify(snapshot.memoDocument)
        : snapshot?.[field];
    const oldValue = value(previous) ?? null;
    const newValue = value(task) ?? null;
    if (oldValue === newValue) continue;
    changedFields.push(field);
    if (previous) before[field] = oldValue;
    after[field] = newValue;
  }
  return { changedFields, ...(previous ? { before } : {}), after };
}
