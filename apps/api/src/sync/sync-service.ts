import type {
  EntityType,
  List,
  Mutation,
  StableMutationResult,
  SyncChange,
  Task,
  VectorCursor,
} from '@naaseh/domain';
import { listSchema, taskSchema } from '@naaseh/domain';
import {
  contractV4MutationResultSchema,
  personalStackMoveSchema,
  personalStackScopeSchema,
  type ContractV4MutationResult,
  type PersonalStackScope,
  type ContentActor,
} from '@naaseh/domain';
import { stackSyncMutationSchema } from '@naaseh/contracts';
import type { PersonalStackService } from '../ranking/stack-service.js';
import type { TaskTimerService } from '../timers/task-timer-service.js';

export type MutationDispatcher = (mutation: Mutation) => Promise<StableMutationResult>;
export type MutationDispatchers = Partial<Record<EntityType, MutationDispatcher>>;

export type PersonalStackSyncMutation = ReturnType<typeof stackSyncMutationSchema.parse>;

export async function dispatchTaskTimerSyncMutation(input: {
  actorId: string;
  sourceClientId: string;
  mutation: Mutation;
  service: TaskTimerService;
}): Promise<ContractV4MutationResult> {
  if (input.mutation.entityType !== 'taskTimer' || input.mutation.operation !== 'timerCommand')
    throw new Error('Invalid task timer sync mutation.');
  const result = await input.service.execute({
    actorId: input.actorId,
    ownerId: input.mutation.entityId,
    mutationId: input.mutation.id,
    sourceClientId: input.sourceClientId,
    baseVersion: input.mutation.baseVersion,
    command: input.mutation.payload,
  });
  return contractV4MutationResultSchema.parse({
    mutationId: input.mutation.id,
    status: result.status === 'duplicate' ? 'duplicate' : result.status,
    version: result.version,
  });
}

export async function dispatchPersonalStackSyncMutation(input: {
  actorId: string;
  actor?: ContentActor;
  sourceClientId: string;
  mutation: unknown;
  service: PersonalStackService;
  onPendingCompaction?: (scope: PersonalStackScope, actor: ContentActor) => Promise<void>;
}): Promise<ContractV4MutationResult> {
  const mutation = stackSyncMutationSchema.parse(input.mutation);
  const request = mutation.payload;
  if (mutation.baseVersion !== request.baseVersion)
    throw new Error('Personal stack mutation versions do not match.');
  const scope = personalStackScopeSchema.parse(
    request.scope === 'overall'
      ? { userId: input.actorId, scopeType: 'overall' }
      : { userId: input.actorId, scopeType: 'project', scopeId: mutation.entityId },
  ) as PersonalStackScope;
  const result = await input.service.reorder({
    actorId: input.actorId,
    ...(input.actor ? { actor: input.actor } : {}),
    scope,
    mutationId: mutation.id,
    sourceClientId: input.sourceClientId,
    baseVersion: request.baseVersion,
    move: personalStackMoveSchema.parse(request.move),
  });
  if (result.status === 'pending_compaction' && input.actor && input.onPendingCompaction)
    await input.onPendingCompaction(scope, input.actor);
  return contractV4MutationResultSchema.parse({
    mutationId: mutation.id,
    status: result.status === 'pending_compaction' ? 'applied' : result.status,
    version: result.stackVersion,
    operationId: mutation.entityId,
  });
}

const personalRankFields = new Set([
  'rank',
  'overallRank',
  'projectRank',
  'overallPosition',
  'projectPosition',
  'stackPosition',
]);

function sharedWorkPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Shared work mutation payload must be an object.');
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((field) => personalRankFields.has(field)))
    throw new Error('Personal stack positions cannot be written through shared work sync.');
  return payload;
}

export function applySharedWorkSyncPayload(
  entityType: 'task',
  current: Task | undefined,
  payload: unknown,
  version: number,
  updatedAt: string,
): Task;
export function applySharedWorkSyncPayload(
  entityType: 'list',
  current: List | undefined,
  payload: unknown,
  version: number,
  updatedAt: string,
): List;
export function applySharedWorkSyncPayload(
  entityType: 'task' | 'list',
  current: Task | List | undefined,
  value: unknown,
  version: number,
  updatedAt: string,
) {
  const payload = sharedWorkPayload(value);
  const candidate = current ? { ...current, ...payload, version, updatedAt } : payload;
  return entityType === 'task' ? taskSchema.parse(candidate) : listSchema.parse(candidate);
}

export function serializeSharedWorkChange(change: SyncChange): SyncChange {
  if (change.operation !== 'upsert' || !change.payload) return change;
  if (change.entityType === 'task') return { ...change, payload: taskSchema.parse(change.payload) };
  if (change.entityType === 'list') return { ...change, payload: listSchema.parse(change.payload) };
  return change;
}

export async function dispatchMutations(
  mutations: readonly Mutation[],
  dispatchers: MutationDispatchers,
): Promise<StableMutationResult[]> {
  const results: StableMutationResult[] = [];
  for (const mutation of mutations) {
    const dispatcher = dispatchers[mutation.entityType];
    results.push(
      dispatcher ? await dispatcher(mutation) : { mutationId: mutation.id, status: 'rejected' },
    );
  }
  return results;
}
export function applyTaskMutation(
  current: Task | undefined,
  mutation: Mutation,
): StableMutationResult {
  if (current && mutation.baseVersion !== current.version)
    return { mutationId: mutation.id, status: 'conflict', version: current.version };
  if (mutation.operation === 'delete')
    return { mutationId: mutation.id, status: 'applied', version: (current?.version ?? 0) + 1 };
  const payload = mutation.payload as Partial<Task>;
  return {
    mutationId: mutation.id,
    status: 'applied',
    version: (current?.version ?? 0) + 1,
    ...(payload ? {} : {}),
  };
}
export function mergeNonOverlapping(
  base: Task,
  local: Partial<Task>,
  remote: Task,
): Task | undefined {
  const conflict = Object.keys(local).some(
    (key) => base[key as keyof Task] !== remote[key as keyof Task],
  );
  return conflict
    ? undefined
    : { ...remote, ...local, version: remote.version + 1, updatedAt: new Date().toISOString() };
}
export const nextFeedSequence = (current: number) => {
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Invalid feed sequence.');
  return current + 1;
};
export function advanceVectorCursor(
  current: VectorCursor,
  feed: string,
  sequence: number,
): VectorCursor {
  return { ...current, [feed]: Math.max(current[feed] ?? 0, sequence) };
}
export function stableReplayResult(
  prior: StableMutationResult | undefined,
  mutation: Mutation,
): StableMutationResult | undefined {
  return prior ? { ...prior, mutationId: mutation.id, status: 'duplicate' } : undefined;
}

export function uniqueAudiences(audiences: readonly string[]): string[] {
  return [...new Set(audiences.filter(Boolean))].sort();
}
