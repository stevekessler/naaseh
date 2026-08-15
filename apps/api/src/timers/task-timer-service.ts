import {
  applyTaskTimerCommand,
  createTaskTimer,
  createUlid,
  taskTimerCommandSchema,
  taskTimerSchema,
  type TaskTimer,
  type TaskTimerCommand,
} from '@naaseh/domain';
import type { TaskTimerCommit, TaskTimerReceipt } from './task-timer-repository.js';

export type TaskTimerConflictReason =
  | 'version_mismatch'
  | 'authorization_changed'
  | 'validation_failed';
export interface TaskTimerMutationResult {
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  version: number;
  reason?: TaskTimerConflictReason;
  timer?: TaskTimer;
}

export interface TaskTimerServiceRepository {
  load(ownerId: string): Promise<TaskTimer | undefined>;
  findReceipt(ownerId: string, mutationId: string): Promise<TaskTimerReceipt | undefined>;
  feedSequence(ownerId: string): Promise<number>;
  commit(input: TaskTimerCommit): Promise<boolean | void>;
}

export function createTaskTimerService(dependencies: {
  repository: TaskTimerServiceRepository;
  canReadTask(ownerId: string, taskId: string): Promise<boolean>;
  now?: () => Date;
  newRunId?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date());
  const newRunId = dependencies.newRunId ?? (() => createUlid());
  return {
    async current(ownerId: string) {
      const timer = await dependencies.repository.load(ownerId);
      if (!timer) return undefined;
      if (!(await dependencies.canReadTask(ownerId, timer.taskId))) return undefined;
      return timer;
    },

    async execute(input: {
      actorId: string;
      ownerId: string;
      mutationId: string;
      sourceClientId: string;
      baseVersion: number;
      command: TaskTimerCommand | unknown;
    }): Promise<TaskTimerMutationResult> {
      if (input.actorId !== input.ownerId)
        return { status: 'rejected', version: input.baseVersion, reason: 'authorization_changed' };
      const prior = await dependencies.repository.findReceipt(input.ownerId, input.mutationId);
      if (prior) return { status: 'duplicate', version: prior.version };

      const command = taskTimerCommandSchema.safeParse(input.command);
      if (!command.success)
        return { status: 'rejected', version: input.baseVersion, reason: 'validation_failed' };
      const current = await dependencies.repository.load(input.ownerId);
      if ((current?.version ?? 0) !== input.baseVersion)
        return {
          status: 'conflict',
          version: current?.version ?? 0,
          reason: 'version_mismatch',
          ...(current ? { timer: current } : {}),
        };

      const targetTaskId =
        command.data.type === 'start' || command.data.type === 'switch'
          ? command.data.taskId
          : current?.taskId;
      if (!targetTaskId || !(await dependencies.canReadTask(input.ownerId, targetTaskId)))
        return {
          status: 'rejected',
          version: current?.version ?? 0,
          reason: 'authorization_changed',
        };

      const acceptedAt = now().toISOString();
      let next: TaskTimer;
      try {
        if (!current) {
          if (command.data.type !== 'start')
            return { status: 'rejected', version: 0, reason: 'validation_failed' };
          next = createTaskTimer(
            input.ownerId,
            command.data.taskId,
            acceptedAt,
            newRunId(),
            command.data.durationSeconds,
          );
        } else {
          if (command.data.type === 'start')
            return { status: 'conflict', version: current.version, reason: 'version_mismatch' };
          next = applyTaskTimerCommand(current, command.data, acceptedAt, newRunId());
        }
        next = taskTimerSchema.parse({
          ...next,
          lastMutationId: input.mutationId,
          sourceClientId: input.sourceClientId,
        });
      } catch {
        return {
          status: 'rejected',
          version: current?.version ?? 0,
          reason: 'validation_failed',
        };
      }
      const committed = await dependencies.repository.commit({
        ownerId: input.ownerId,
        mutationId: input.mutationId,
        baseVersion: input.baseVersion,
        timer: next,
        expectedFeedSequence: await dependencies.repository.feedSequence(input.ownerId),
      });
      if (committed === false)
        return { status: 'conflict', version: current?.version ?? 0, reason: 'version_mismatch' };
      return { status: 'applied', version: next.version, timer: next };
    },
  };
}

export type TaskTimerService = ReturnType<typeof createTaskTimerService>;
