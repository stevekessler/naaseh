import { z } from 'zod';
import type { TaskRevision } from './revision.js';
import { createUlid, ulidSchema } from './primitives.js';

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
    groupId: z.string().optional(),
    parentId: z.string().optional(),
    visibility: visibilitySchema.default('public'),
    status: taskStatusSchema.default('open'),
    completedAt: z.string().datetime().optional(),
    completedBy: z.string().optional(),
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
  if (task.status === 'completed' && (!task.completedAt || !task.completedBy))
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'Completed tasks require completion metadata.',
    });
  if (task.status !== 'completed' && (task.completedAt || task.completedBy))
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'Only completed tasks may retain completion metadata.',
    });
}

export const taskSchema = taskObjectSchema.superRefine(validateTaskInvariants);
export const taskInputSchema = taskObjectSchema
  .omit({ id: true, ownerId: true, createdAt: true, updatedAt: true, version: true })
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
  task: Pick<Task, 'ownerId' | 'visibility'>,
  actor: { id: string; role: 'admin' | 'user'; active: boolean },
) {
  if (!actor.active) return { allowed: false, privileged: false };
  if (task.ownerId === actor.id || task.visibility === 'public')
    return { allowed: true, privileged: false };
  if (actor.role === 'admin') return { allowed: true, privileged: true };
  return { allowed: false, privileged: false };
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
      ? { completedAt: timestamp, completedBy: actorId }
      : { completedAt: undefined, completedBy: undefined }),
  });
}
