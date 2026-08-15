import { z } from 'zod';

export const taskTimerStatusSchema = z.enum(['running', 'paused', 'finished', 'stopped']);
export const taskTimerDurationSchema = z
  .number()
  .int()
  .min(60)
  .max(86_400)
  .refine((value) => value % 60 === 0, 'Timer duration must use whole minutes');

export const taskTimerSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    taskId: z.string().min(1),
    durationSeconds: taskTimerDurationSchema,
    repeatEnabled: z.boolean(),
    status: taskTimerStatusSchema,
    runId: z.string().min(1),
    intervalOrdinal: z.number().int().positive(),
    completedIntervalsAtAnchor: z.number().int().nonnegative(),
    anchorAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    pausedRemainingSeconds: z.number().int().nonnegative().nullable(),
    lastCompletedAt: z.string().datetime().nullable(),
    version: z.number().int().positive(),
    lastMutationId: z.string().min(1).optional(),
    sourceClientId: z.string().min(1).optional(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((timer, context) => {
    if (timer.id !== timer.ownerId)
      context.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Timer identity must equal owner',
      });
    if (timer.status === 'running') {
      if (!timer.anchorAt || !timer.endsAt || timer.pausedRemainingSeconds !== null)
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Running timer requires anchors and no paused remaining value',
        });
    } else if (timer.status === 'paused') {
      if (
        timer.anchorAt !== null ||
        timer.endsAt !== null ||
        timer.pausedRemainingSeconds === null ||
        timer.pausedRemainingSeconds > timer.durationSeconds
      )
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Paused timer requires a bounded remaining value and no anchors',
        });
    } else if (
      timer.anchorAt !== null ||
      timer.endsAt !== null ||
      timer.pausedRemainingSeconds !== null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Inactive timer cannot retain active timing fields',
      });
    }
  });

export type TaskTimer = z.infer<typeof taskTimerSchema>;
export interface TaskTimerFeedbackIdentity {
  runId: string;
  intervalOrdinal: number;
}
export interface EffectiveTaskTimer extends TaskTimer {
  remainingSeconds: number;
  feedback?: TaskTimerFeedbackIdentity;
}

export const taskTimerCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      taskId: z.string().min(1),
      durationSeconds: taskTimerDurationSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('resume') }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
  z.object({ type: z.literal('restart') }).strict(),
  z
    .object({ type: z.literal('changeDuration'), durationSeconds: taskTimerDurationSchema })
    .strict(),
  z.object({ type: z.literal('setRepeat'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('switch'), taskId: z.string().min(1) }).strict(),
]);
export type TaskTimerCommand = z.infer<typeof taskTimerCommandSchema>;

const instant = (value: string) => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid timer instant');
  return milliseconds;
};
const isoAfter = (value: string, seconds: number) =>
  new Date(instant(value) + seconds * 1_000).toISOString();

export function createTaskTimer(
  ownerId: string,
  taskId: string,
  now: string,
  runId: string,
  durationSeconds = 600,
): TaskTimer {
  return taskTimerSchema.parse({
    id: ownerId,
    ownerId,
    taskId,
    durationSeconds,
    repeatEnabled: false,
    status: 'running',
    runId,
    intervalOrdinal: 1,
    completedIntervalsAtAnchor: 0,
    anchorAt: now,
    endsAt: isoAfter(now, durationSeconds),
    pausedRemainingSeconds: null,
    lastCompletedAt: null,
    version: 1,
    updatedAt: now,
  });
}

export function effectiveTaskTimer(timer: TaskTimer, now: string): EffectiveTaskTimer {
  const valid = taskTimerSchema.parse(timer);
  if (valid.status === 'paused') {
    return { ...valid, remainingSeconds: valid.pausedRemainingSeconds ?? 0 };
  }
  if (valid.status !== 'running' || !valid.endsAt) return { ...valid, remainingSeconds: 0 };

  const nowMs = instant(now);
  const endsMs = instant(valid.endsAt);
  if (nowMs < endsMs) {
    return { ...valid, remainingSeconds: Math.max(0, Math.ceil((endsMs - nowMs) / 1_000)) };
  }
  if (!valid.repeatEnabled) {
    return {
      ...valid,
      status: 'finished',
      anchorAt: null,
      endsAt: null,
      pausedRemainingSeconds: null,
      lastCompletedAt: valid.endsAt,
      remainingSeconds: 0,
      feedback: { runId: valid.runId, intervalOrdinal: valid.intervalOrdinal },
    };
  }

  const durationMs = valid.durationSeconds * 1_000;
  const afterFirstBoundary = nowMs - endsMs;
  const completed = 1 + Math.floor(afterFirstBoundary / durationMs);
  const latestCompletedOrdinal = valid.intervalOrdinal + completed - 1;
  const remainderMs = afterFirstBoundary % durationMs;
  const remainingSeconds = valid.durationSeconds - Math.floor(remainderMs / 1_000);
  const nextEndsAt = new Date(nowMs + remainingSeconds * 1_000).toISOString();
  return {
    ...valid,
    intervalOrdinal: valid.intervalOrdinal + completed,
    completedIntervalsAtAnchor: valid.completedIntervalsAtAnchor + completed,
    anchorAt: new Date(Date.parse(nextEndsAt) - durationMs).toISOString(),
    endsAt: nextEndsAt,
    lastCompletedAt: new Date(endsMs + (completed - 1) * durationMs).toISOString(),
    remainingSeconds,
    feedback: { runId: valid.runId, intervalOrdinal: latestCompletedOrdinal },
  };
}

export function applyTaskTimerCommand(
  timer: TaskTimer,
  command: TaskTimerCommand,
  now: string,
  nextRunId: string,
): TaskTimer {
  if (command.type === 'start') throw new Error('Start creates a timer when none exists');
  const effective = effectiveTaskTimer(timer, now);
  const base: TaskTimer = {
    ...effective,
    version: timer.version + 1,
    updatedAt: now,
  };
  delete (base as Partial<EffectiveTaskTimer>).remainingSeconds;
  delete (base as Partial<EffectiveTaskTimer>).feedback;

  if (command.type === 'setRepeat')
    return taskTimerSchema.parse({ ...base, repeatEnabled: command.enabled });
  if (command.type === 'stop')
    return taskTimerSchema.parse({
      ...base,
      status: 'stopped',
      anchorAt: null,
      endsAt: null,
      pausedRemainingSeconds: null,
    });
  if (command.type === 'pause') {
    if (effective.status !== 'running') throw new Error('Only a running timer can be paused');
    return taskTimerSchema.parse({
      ...base,
      status: 'paused',
      anchorAt: null,
      endsAt: null,
      pausedRemainingSeconds: effective.remainingSeconds,
    });
  }
  if (command.type === 'resume') {
    if (effective.status !== 'paused') throw new Error('Only a paused timer can be resumed');
    return taskTimerSchema.parse({
      ...base,
      status: 'running',
      anchorAt: now,
      endsAt: isoAfter(now, effective.remainingSeconds),
      pausedRemainingSeconds: null,
    });
  }

  const durationSeconds =
    command.type === 'changeDuration'
      ? taskTimerDurationSchema.parse(command.durationSeconds)
      : effective.durationSeconds;
  const taskId = command.type === 'switch' ? command.taskId : effective.taskId;
  return taskTimerSchema.parse({
    ...base,
    taskId,
    durationSeconds,
    status: 'running',
    runId: nextRunId,
    intervalOrdinal: 1,
    completedIntervalsAtAnchor: 0,
    anchorAt: now,
    endsAt: isoAfter(now, durationSeconds),
    pausedRemainingSeconds: null,
    lastCompletedAt: null,
  });
}
