import { z } from 'zod';
import type { TaskRevision } from './revision.js';
import { createUlid, ulidSchema } from './primitives.js';
import {
  completionEventSchema,
  reverseCompletionEvent,
  type CompletionEvent,
} from './completion-event.js';
import { authorizeContent } from './authorization.js';

export const visibilitySchema = z.enum(['public', 'private']);
export const taskStatusSchema = z.enum(['open', 'completed', 'archived']);
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Task links must use HTTPS.');

const taskObjectSchema = z
  .object({
    id: ulidSchema,
    ownerId: z.string().min(1),
    label: z.string().trim().min(1).max(300),
    link: httpsUrlSchema.optional().or(z.literal('')),
    memo: z.string().max(20_000).default(''),
    memoHidden: z.boolean().default(false),
    encryptedMemo: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    dueAt: z.string().datetime().optional(),
    dueTimeZone: z.string().min(1).optional(),
    assigneeId: z.string().optional(),
    categoryId: z.string().optional(),
    projectId: ulidSchema.optional(),
    groupId: z.string().optional(),
    parentId: z.string().optional(),
    visibility: visibilitySchema.default('public'),
    status: taskStatusSchema.default('open'),
    lifecycle: z.enum(['active', 'archived', 'deleting']).optional(),
    completionState: z.enum(['open', 'completed']).optional(),
    archiveReason: z.enum(['completed', 'manual']).optional(),
    archivedAt: z.string().datetime().optional(),
    archivedBy: z.string().min(1).optional(),
    completedAt: z.string().datetime().optional(),
    completedBy: z.string().optional(),
    currentCompletionEventId: ulidSchema.optional(),
    version: z.number().int().positive().default(1),
  })
  .strict();

function validateTaskInvariants(
  task: {
    dueAt?: string | undefined;
    dueTimeZone?: string | undefined;
    memoHidden?: boolean | undefined;
    memo?: string | undefined;
    encryptedMemo?: string | undefined;
    status?: string | undefined;
    completionState?: string | undefined;
    completedAt?: string | undefined;
    completedBy?: string | undefined;
  },
  context: z.RefinementCtx,
) {
  if (Boolean(task.dueAt) !== Boolean(task.dueTimeZone))
    context.addIssue({
      code: 'custom',
      path: ['dueTimeZone'],
      message: 'dueAt and dueTimeZone must be provided together.',
    });
  if (task.memoHidden && task.memo)
    context.addIssue({
      code: 'custom',
      path: ['memo'],
      message: 'Hidden memo plaintext cannot be stored.',
    });
  if (!task.memoHidden && task.encryptedMemo)
    context.addIssue({
      code: 'custom',
      path: ['encryptedMemo'],
      message: 'Encrypted memo data requires memoHidden.',
    });
  const completionState =
    task.completionState ?? (task.status === 'completed' ? 'completed' : 'open');
  if (completionState === 'completed' && (!task.completedAt || !task.completedBy))
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'Completed tasks require completion metadata.',
    });
  if (completionState !== 'completed' && (task.completedAt || task.completedBy))
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'Only completed tasks may retain completion metadata.',
    });
}

export const taskSchema = taskObjectSchema.superRefine(validateTaskInvariants);
export const taskInputSchema = taskObjectSchema
  .omit({
    id: true,
    ownerId: true,
    createdAt: true,
    updatedAt: true,
    version: true,
    lifecycle: true,
    completionState: true,
    archiveReason: true,
    archivedAt: true,
    archivedBy: true,
    completedAt: true,
    completedBy: true,
    currentCompletionEventId: true,
  })
  .partial()
  .required({ label: true })
  .strict()
  .superRefine(validateTaskInvariants);

export type Task = z.infer<typeof taskSchema>;
export type TaskInput = z.input<typeof taskInputSchema>;
export type { TaskRevision };

export function canReadTask(task: Task, actorId: string): boolean {
  return task.visibility === 'public' || task.ownerId === actorId;
}
export const taskLockState = (task: Pick<Task, 'visibility'>): 'locked' | 'unlocked' =>
  task.visibility === 'private' ? 'locked' : 'unlocked';
export function canReadTaskAs(
  task: Pick<Task, 'ownerId' | 'visibility' | 'groupId'>,
  actor: { id: string; role: 'admin' | 'user'; active: boolean; groupIds?: string[] },
) {
  return authorizeContent({
    actor: { ...actor, groupIds: actor.groupIds ?? [] },
    ownerId: task.ownerId,
    locked: task.visibility === 'private',
    ...(task.groupId ? { groupId: task.groupId } : {}),
  });
}
export function setTaskLocked(
  task: Task,
  locked: boolean,
  actorId: string,
  now = new Date(),
): Task {
  if (task.ownerId !== actorId) throw new Error('Only the owner can change task locking.');
  return taskSchema.parse({
    ...task,
    visibility: locked ? 'private' : 'public',
    updatedAt: now.toISOString(),
    version: task.version + 1,
  });
}
export function createTask(input: TaskInput, actorId: string, now = new Date()): Task {
  const timestamp = now.toISOString();
  return taskSchema.parse({
    ...input,
    id: createUlid(now.getTime()),
    ownerId: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    lifecycle: 'active',
    completionState: 'open',
    version: 1,
  });
}
export function transitionTask(
  task: Task,
  status: Task['status'],
  actorId: string,
  now = new Date(),
): Task {
  const timestamp = now.toISOString();
  return taskSchema.parse({
    ...task,
    status,
    updatedAt: timestamp,
    version: task.version + 1,
    ...(status === 'completed'
      ? {
          lifecycle: 'active',
          completionState: 'completed',
          completedAt: timestamp,
          completedBy: actorId,
        }
      : status === 'archived'
        ? { lifecycle: 'archived', completionState: 'open', archiveReason: 'manual' }
        : {
            lifecycle: 'active',
            completionState: 'open',
            completedAt: undefined,
            completedBy: undefined,
            currentCompletionEventId: undefined,
            archiveReason: undefined,
            archivedAt: undefined,
            archivedBy: undefined,
          }),
  });
}

export interface CompletionAttribution {
  projectId?: string;
  projectName?: string;
  categoryId?: string;
  categoryName?: string;
}

export function archiveTask(task: Task, actorId: string, now = new Date()): Task {
  if ((task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active')) !== 'active')
    throw new Error('Only an active task can be archived.');
  const timestamp = now.toISOString();
  return taskSchema.parse({
    ...task,
    status: 'archived',
    lifecycle: 'archived',
    archiveReason: 'manual',
    archivedAt: timestamp,
    archivedBy: actorId,
    updatedAt: timestamp,
    version: task.version + 1,
  });
}

export function completeAndArchiveTask(
  task: Task,
  actorId: string,
  attribution: CompletionAttribution = {},
  now = new Date(),
): { task: Task; completionEvent: CompletionEvent } {
  if ((task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active')) !== 'active')
    throw new Error('Only an active task can be completed.');
  const timestamp = now.toISOString();
  const event = completionEventSchema.parse({
    id: createUlid(now.getTime()),
    taskId: task.id,
    completedBy: actorId,
    occurredAt: timestamp,
    ...(attribution.projectId ? { projectIdAtCompletion: attribution.projectId } : {}),
    ...(attribution.projectName ? { projectNameAtCompletion: attribution.projectName } : {}),
    ...(attribution.categoryId ? { categoryIdAtCompletion: attribution.categoryId } : {}),
    ...(attribution.categoryName ? { categoryNameAtCompletion: attribution.categoryName } : {}),
    counted: true,
    createdAt: timestamp,
  });
  return {
    task: taskSchema.parse({
      ...task,
      status: 'archived',
      lifecycle: 'archived',
      completionState: 'completed',
      archiveReason: 'completed',
      archivedAt: timestamp,
      archivedBy: actorId,
      completedAt: timestamp,
      completedBy: actorId,
      currentCompletionEventId: event.id,
      updatedAt: timestamp,
      version: task.version + 1,
    }),
    completionEvent: event,
  };
}

export function restoreArchivedTask(
  task: Task,
  currentEvent: CompletionEvent | undefined,
  actorId: string,
  mutationId = createUlid(),
  now = new Date(),
): { task: Task; completionEvent?: CompletionEvent } {
  if ((task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active')) !== 'archived')
    throw new Error('Only an archived task can be restored.');
  if (task.currentCompletionEventId && currentEvent?.id !== task.currentCompletionEventId)
    throw new Error('Current completion event is required to restore this task.');
  const timestamp = now.toISOString();
  const reversed = currentEvent
    ? reverseCompletionEvent(currentEvent, actorId, mutationId, now)
    : undefined;
  return {
    task: taskSchema.parse({
      ...task,
      status: 'open',
      lifecycle: 'active',
      completionState: 'open',
      archiveReason: undefined,
      archivedAt: undefined,
      archivedBy: undefined,
      completedAt: undefined,
      completedBy: undefined,
      currentCompletionEventId: undefined,
      updatedAt: timestamp,
      version: task.version + 1,
    }),
    ...(reversed ? { completionEvent: reversed } : {}),
  };
}
