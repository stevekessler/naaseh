import { createHash } from 'node:crypto';
import {
  BatchGetCommand,
  QueryCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  canReadTaskAs,
  urgencyValues,
  workloadScopes,
  type ContentActor,
  type List,
  type Task,
  type Urgency,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { getRecord } from '../shared/store.js';
import {
  createPaginationCursorPayload,
  decodePaginationCursor,
  encodePaginationCursor,
  PAGINATION_CURSOR_TTL_MS,
  PaginationCursorError,
  validatePaginationCursorContext,
  type PaginationCursorContext,
} from '../shared/pagination-cursor.js';
import type { PaginationCursorCodec } from '../shared/persistent-pagination-cursor.js';
import { authorizeList } from '../lists/list-authorization.js';

export { PaginationCursorError } from '../shared/pagination-cursor.js';

export type WorkViewUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface WorkViewCandidate {
  id: string;
  urgency: WorkViewUrgency;
  canonicalPosition: number;
  sourcePage: number;
  audience?: string;
  authorized?: boolean;
  lifecycle?: 'active' | 'archived';
  projectId?: string;
  categoryId?: string;
  assigneeId?: string;
  dueDate?: string;
  contentType?: 'todos' | 'lists';
}

export interface WorkViewReadContext extends PaginationCursorContext {
  actorId: string;
  accessEpoch: number;
  endpoint: 'overall_stack' | 'project_stack' | 'archive' | 'workload' | 'drilldown';
  scope: string;
  orderBy: 'overallRank' | 'projectRank' | 'source';
  filters: {
    urgencies?: WorkViewUrgency[];
    from?: string;
    to?: string;
    assigneeId?: string;
    categoryId?: string;
    projectId?: string;
    lifecycle?: 'active' | 'archived';
    contentType?: 'all' | 'todos' | 'lists';
  };
  sourceEpochs: Record<string, number>;
  stackVersion?: number;
  snapshotGeneration?: number;
  tailWatermark?: string;
}

function allowedAudiences(context: WorkViewReadContext) {
  const values = new Set<string>();
  for (const source of Object.keys(context.sourceEpochs)) {
    if (source === 'owner') values.add(`OWNER#${context.actorId}`);
    else if (source === 'public') values.add('PUBLIC');
    else if (source.startsWith('group:')) values.add(`GROUP#${source.slice('group:'.length)}`);
    else if (source.startsWith('admin:')) values.add(`ADMIN#${source.slice('admin:'.length)}`);
  }
  return values;
}

function matches(candidate: WorkViewCandidate, context: WorkViewReadContext) {
  const filters = context.filters;
  if (candidate.authorized === false) return false;
  if (candidate.audience && !allowedAudiences(context).has(candidate.audience)) return false;
  if (filters.urgencies && !filters.urgencies.includes(candidate.urgency)) return false;
  if (filters.lifecycle && candidate.lifecycle !== filters.lifecycle) return false;
  if (filters.projectId && candidate.projectId !== filters.projectId) return false;
  if (filters.categoryId && candidate.categoryId !== filters.categoryId) return false;
  if (filters.assigneeId && candidate.assigneeId !== filters.assigneeId) return false;
  if (filters.from && (!candidate.dueDate || candidate.dueDate < filters.from)) return false;
  if (filters.to && (!candidate.dueDate || candidate.dueDate > filters.to)) return false;
  if (
    filters.contentType &&
    filters.contentType !== 'all' &&
    candidate.contentType !== filters.contentType
  )
    return false;
  return true;
}

export async function readAuthorizedWorkViewPage(input: {
  context: WorkViewReadContext;
  candidates: WorkViewCandidate[];
  cursor?: string;
  limit: number;
  cursorCodec?: PaginationCursorCodec;
}) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200)
    throw new Error('Page limit must be between 1 and 200.');
  const decoded = input.cursor
    ? input.cursorCodec
      ? await input.cursorCodec.decode(input.cursor, input.context.actorId, input.context.now)
      : decodePaginationCursor(input.cursor)
    : undefined;
  if (decoded) validatePaginationCursorContext(decoded, input.context);
  const start = decoded?.nextIndex ?? 0;
  const candidates = [...input.candidates].sort(
    (left, right) =>
      left.canonicalPosition - right.canonicalPosition || left.id.localeCompare(right.id),
  );
  const candidateBudget = Math.max(500, Math.min(4_000, 20 * input.limit));
  const sourcePages = new Set<number>();
  const emitted = new Set<string>();
  const items: WorkViewCandidate[] = [];
  let position = start;
  while (position < candidates.length && position - start < candidateBudget) {
    const candidate = candidates[position]!;
    if (!sourcePages.has(candidate.sourcePage) && sourcePages.size === 4) break;
    sourcePages.add(candidate.sourcePage);
    position += 1;
    if (!matches(candidate, input.context) || emitted.has(candidate.id)) continue;
    emitted.add(candidate.id);
    items.push(candidate);
    if (items.length === input.limit) {
      // Equal identities from overlapping audience streams are adjacent in the
      // canonical merge. Consume them as a unit so the next page cannot emit
      // the same work item again.
      while (
        position < candidates.length &&
        position - start < candidateBudget &&
        candidates[position]?.id === candidate.id
      ) {
        const duplicate = candidates[position]!;
        if (!sourcePages.has(duplicate.sourcePage) && sourcePages.size === 4) break;
        sourcePages.add(duplicate.sourcePage);
        position += 1;
      }
      break;
    }
  }
  return {
    items,
    nextCursor:
      position < candidates.length
        ? input.cursorCodec
          ? await input.cursorCodec.encode(createPaginationCursorPayload(input.context, position))
          : encodePaginationCursor(createPaginationCursorPayload(input.context, position))
        : null,
    examinedCandidates: position - start,
    sourcePagesRead: sourcePages.size,
  };
}

export function workViewAudienceShard(entityId: string, shardCount = 16) {
  let hash = 2166136261;
  for (const character of entityId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % shardCount;
}

export function workViewAudiencesFor(actor: ContentActor) {
  return actor.role === 'admin'
    ? Array.from({ length: 16 }, (_, shard) => `ADMIN#${shard}`)
    : [`OWNER#${actor.id}`, 'PUBLIC', ...actor.groupIds.map((groupId) => `GROUP#${groupId}`)];
}

/** Query pointer partitions, then hydrate canonical work. Authorization remains mandatory in callers. */
export async function listProjectedWork(input: {
  actor: ContentActor;
  lifecycle: 'active' | 'archived';
  urgencies?: readonly Urgency[];
  scopeType?: 'overall' | 'project' | 'category' | 'unassigned';
  scopeId?: string;
}) {
  const scopeType = input.scopeType ?? 'overall';
  const scopeId = input.scopeId ?? 'overall';
  const pointers = new Map<string, { workId: string; workType: 'task' | 'list' }>();
  for (const audience of workViewAudiencesFor(input.actor)) {
    for (const urgency of input.urgencies?.length ? input.urgencies : urgencyValues) {
      const partition = workViewPartition({
        audience,
        lifecycle: input.lifecycle,
        scopeType,
        scopeId,
        urgency,
      });
      let ExclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const result = await dynamodb.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK=:pk AND begins_with(SK,:item)',
            ExpressionAttributeValues: { ':pk': partition, ':item': 'ITEM#' },
            ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
          }),
        );
        for (const item of result.Items ?? []) {
          const data = item.data as { workId?: string; workType?: 'task' | 'list' } | undefined;
          if (data?.workId && data.workType)
            pointers.set(`${data.workType}:${data.workId}`, {
              workId: data.workId,
              workType: data.workType,
            });
        }
        ExclusiveStartKey = result.LastEvaluatedKey;
      } while (ExclusiveStartKey);
    }
  }
  const tasks: Task[] = [];
  const lists: List[] = [];
  for (const pointer of pointers.values()) {
    const prefix = pointer.workType === 'task' ? 'TASK' : 'LIST';
    const value = await getRecord<{ data: Task | List }>(`${prefix}#${pointer.workId}`, 'CURRENT');
    if (!value?.data) continue;
    if (pointer.workType === 'task') tasks.push(value.data as Task);
    else lists.push(value.data as List);
  }
  return { tasks, lists };
}

interface ProjectedPointer {
  partition: string;
  workId: string;
  workType: 'task' | 'list';
  audience: string;
}

interface ProjectedPageState {
  partitionIndex: number;
  exclusiveStartKey?: Record<string, unknown>;
  pendingPointers?: ProjectedPointer[];
}

const sourceState = (value: Record<string, unknown> | undefined): ProjectedPageState => {
  const state = value?.projectedWork as Partial<ProjectedPageState> | undefined;
  if (!state) return { partitionIndex: 0 };
  if (!Number.isSafeInteger(state.partitionIndex) || Number(state.partitionIndex) < 0)
    throw new PaginationCursorError(400, 'invalid_cursor', 'Cursor source position is invalid.');
  return {
    partitionIndex: Number(state.partitionIndex),
    ...(state.exclusiveStartKey ? { exclusiveStartKey: state.exclusiveStartKey } : {}),
    ...(Array.isArray(state.pendingPointers)
      ? { pendingPointers: state.pendingPointers as ProjectedPointer[] }
      : {}),
  };
};

async function batchGetItems(pointers: readonly ProjectedPointer[]) {
  const unique = new Map(
    pointers.map((pointer) => [
      `${pointer.workType}:${pointer.workId}`,
      {
        PK: `${pointer.workType === 'task' ? 'TASK' : 'LIST'}#${pointer.workId}`,
        SK: 'CURRENT',
      },
    ]),
  );
  const records = new Map<string, Task | List>();
  let pending = [...unique.values()];
  while (pending.length) {
    const batch = pending.slice(0, 100);
    pending = pending.slice(100);
    const response = await dynamodb.send(
      new BatchGetCommand({ RequestItems: { [tableName]: { Keys: batch } } }),
    );
    for (const item of response.Responses?.[tableName] ?? []) {
      const value = item.data as Task | List | undefined;
      if (value) records.set(`${item.PK}:${value.id}`, value);
    }
    const unprocessed = (response.UnprocessedKeys?.[tableName]?.Keys ?? []) as Array<{
      PK: string;
      SK: string;
    }>;
    if (unprocessed.length) pending.unshift(...unprocessed);
  }
  return records;
}

function preferredAudience(work: Task | List, actor: ContentActor) {
  if (actor.role === 'admin') return `ADMIN#${workViewAudienceShard(work.id)}`;
  if (work.ownerId === actor.id) return `OWNER#${actor.id}`;
  if (work.groupId && actor.groupIds.includes(work.groupId)) return `GROUP#${work.groupId}`;
  if ('visibility' in work && work.visibility === 'public') return 'PUBLIC';
  return undefined;
}

export async function readProjectedWorkPage(input: {
  actor: ContentActor;
  lifecycle: 'active' | 'archived';
  urgencies?: readonly Urgency[];
  scopeType?: 'overall' | 'project' | 'category' | 'unassigned';
  scopeId?: string;
  endpoint: WorkViewReadContext['endpoint'];
  orderBy: WorkViewReadContext['orderBy'];
  accessEpoch: number;
  filters: WorkViewReadContext['filters'];
  cursor?: string;
  limit: number;
  cursorCodec: PaginationCursorCodec;
  accept?: (work: Task | List, workType: 'task' | 'list') => boolean | Promise<boolean>;
}) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200)
    throw new PaginationCursorError(400, 'invalid_cursor', 'Page limit is invalid.');
  const scopeType = input.scopeType ?? 'overall';
  const scopeId = input.scopeId ?? 'overall';
  const partitions = workViewAudiencesFor(input.actor)
    .sort()
    .flatMap((audience) =>
      (input.urgencies?.length ? input.urgencies : urgencyValues).map((urgency) =>
        workViewPartition({
          audience,
          lifecycle: input.lifecycle,
          scopeType,
          scopeId,
          urgency,
        }),
      ),
    );
  const sourceEpochs: Record<string, number> = {};
  for (let offset = 0; offset < partitions.length; offset += 100) {
    const selected = partitions.slice(offset, offset + 100);
    const response = await dynamodb.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: { Keys: selected.map((PK) => ({ PK, SK: 'META' })) },
        },
      }),
    );
    const epochs = new Map(
      (response.Responses?.[tableName] ?? []).map((item) => [
        String(item.PK),
        Number(item.sourceEpoch ?? 0),
      ]),
    );
    for (const partition of selected)
      sourceEpochs[createHash('sha256').update(partition).digest('hex').slice(0, 16)] =
        epochs.get(partition) ?? 0;
  }
  const context: WorkViewReadContext = {
    actorId: input.actor.id,
    accessEpoch: input.accessEpoch,
    endpoint: input.endpoint,
    scope: `${scopeType}:${scopeId}`,
    orderBy: input.orderBy,
    filters: input.filters,
    sourceEpochs,
    now: Date.now(),
  };
  const decoded = input.cursor
    ? await input.cursorCodec.decode(input.cursor, input.actor.id, context.now)
    : undefined;
  if (decoded) validatePaginationCursorContext(decoded, context);
  const state = sourceState(decoded?.sourcePositions);
  if (state.partitionIndex > partitions.length)
    throw new PaginationCursorError(400, 'invalid_cursor', 'Cursor source position is invalid.');
  const candidateBudget = Math.max(500, Math.min(4_000, 20 * input.limit));
  const items: Array<{ work: Task | List; workType: 'task' | 'list' }> = [];
  let examinedCandidates = 0;
  let sourcePagesRead = 0;
  let pending = [...(state.pendingPointers ?? [])];

  while (
    items.length < input.limit &&
    state.partitionIndex < partitions.length &&
    examinedCandidates < candidateBudget &&
    sourcePagesRead < 4
  ) {
    if (!pending.length) {
      const partition = partitions[state.partitionIndex]!;
      const response = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK=:pk AND begins_with(SK,:item)',
          ExpressionAttributeValues: { ':pk': partition, ':item': 'ITEM#' },
          Limit: Math.min(100, candidateBudget - examinedCandidates),
          ...(state.exclusiveStartKey ? { ExclusiveStartKey: state.exclusiveStartKey } : {}),
        }),
      );
      sourcePagesRead += 1;
      examinedCandidates += response.Count ?? response.Items?.length ?? 0;
      pending = (response.Items ?? []).flatMap((item) => {
        const data = item.data as Partial<ProjectedPointer> | undefined;
        return data?.workId && data.workType && data.audience
          ? [{ partition, workId: data.workId, workType: data.workType, audience: data.audience }]
          : [];
      });
      if (response.LastEvaluatedKey) state.exclusiveStartKey = response.LastEvaluatedKey;
      else {
        state.partitionIndex += 1;
        delete state.exclusiveStartKey;
      }
      if (!pending.length) continue;
    }

    const batch = pending.splice(0, Math.min(100, pending.length));
    const hydrated = await batchGetItems(batch);
    for (let index = 0; index < batch.length; index += 1) {
      const pointer = batch[index]!;
      const work = hydrated.get(
        `${pointer.workType === 'task' ? 'TASK' : 'LIST'}#${pointer.workId}:${pointer.workId}`,
      );
      if (!work || preferredAudience(work, input.actor) !== pointer.audience) continue;
      const authorized =
        pointer.workType === 'task'
          ? canReadTaskAs(work as Task, input.actor).allowed
          : authorizeList(work as List, input.actor).allowed;
      const lifecycle =
        work.lifecycle ?? ('status' in work && work.status === 'active' ? 'active' : work.status);
      if (!authorized || lifecycle !== input.lifecycle) continue;
      if (input.urgencies?.length && !input.urgencies.includes(work.urgency)) continue;
      if (input.accept && !(await input.accept(work, pointer.workType))) continue;
      items.push({ work, workType: pointer.workType });
      if (items.length === input.limit) {
        pending.unshift(...batch.slice(index + 1));
        break;
      }
    }
  }

  const hasMore = pending.length > 0 || state.partitionIndex < partitions.length;
  const nextCursor = hasMore
    ? await input.cursorCodec.encode(
        createPaginationCursorPayload(context, 0, PAGINATION_CURSOR_TTL_MS, {
          projectedWork: {
            partitionIndex: state.partitionIndex,
            ...(state.exclusiveStartKey ? { exclusiveStartKey: state.exclusiveStartKey } : {}),
            ...(pending.length ? { pendingPointers: pending } : {}),
          },
        }),
      )
    : null;
  return {
    asOf: new Date(context.now).toISOString(),
    items,
    nextCursor,
    examinedCandidates,
    sourcePagesRead,
  };
}

export function workViewPartition(input: {
  audience: string;
  lifecycle: 'active' | 'archived';
  scopeType: 'overall' | 'project' | 'category' | 'unassigned';
  scopeId: string;
  urgency: WorkViewUrgency;
}) {
  return `WORKVIEW#AUDIENCE#${input.audience}#LIFECYCLE#${input.lifecycle}#SCOPE#${input.scopeType}#${input.scopeId}#URGENCY#${input.urgency}`;
}

export interface ProjectedWorkView {
  id: string;
  workType: 'task' | 'list';
  audience: string;
  audiences?: string[];
  lifecycle?: 'active' | 'archived' | 'deleting';
  projectId?: string;
  categoryId?: string;
  urgency: WorkViewUrgency;
  sortKey?: string;
}

export interface WorkViewProjectionChange {
  audience: string;
  lifecycle: 'active' | 'archived';
  scopeType: 'overall' | 'project' | 'category' | 'unassigned';
  scopeId: string;
  urgency: WorkViewUrgency;
  workId: string;
  workType: 'task' | 'list';
  sortKey: string;
  delta: 1 | -1;
}

function projectedChanges(work: ProjectedWorkView | undefined, delta: 1 | -1) {
  if (!work || (work.lifecycle !== 'active' && work.lifecycle !== 'archived')) return [];
  const audiences = [
    ...(work.audiences ?? [work.audience]),
    `ADMIN#${workViewAudienceShard(work.id)}`,
  ].filter((audience, index, all) => all.indexOf(audience) === index);
  const scopes = [
    { type: 'overall' as const, id: 'overall' },
    ...workloadScopes(work.projectId, work.categoryId),
  ];
  return audiences.flatMap((audience) =>
    scopes.map(
      (scope): WorkViewProjectionChange => ({
        audience,
        lifecycle: work.lifecycle as 'active' | 'archived',
        scopeType: scope.type,
        scopeId: scope.id,
        urgency: work.urgency,
        workId: work.id,
        workType: work.workType,
        sortKey: work.sortKey ?? work.id,
        delta,
      }),
    ),
  );
}

export function workViewProjectionChanges(
  before: ProjectedWorkView | undefined,
  after: ProjectedWorkView | undefined,
) {
  const grouped = new Map<string, WorkViewProjectionChange>();
  for (const change of [...projectedChanges(before, -1), ...projectedChanges(after, 1)]) {
    const identity = [
      change.audience,
      change.lifecycle,
      change.scopeType,
      change.scopeId,
      change.urgency,
      change.workType,
      change.workId,
      change.sortKey,
    ].join('|');
    const prior = grouped.get(identity);
    if (prior && prior.delta !== change.delta) grouped.delete(identity);
    else grouped.set(identity, change);
  }
  return [...grouped.values()];
}

export function workViewProjectionWrites(
  changes: WorkViewProjectionChange[],
): NonNullable<TransactWriteCommandInput['TransactItems']> {
  const writes: NonNullable<TransactWriteCommandInput['TransactItems']> = [];
  const changedPartitions = new Set<string>();
  for (const change of changes) {
    const partition = workViewPartition(change);
    const key = {
      PK: partition,
      SK: `ITEM#${change.sortKey}#${change.workType}#${change.workId}`,
    };
    if (change.delta > 0)
      writes.push({
        Put: {
          TableName: tableName,
          Item: {
            ...key,
            data: {
              workId: change.workId,
              workType: change.workType,
              urgency: change.urgency,
              lifecycle: change.lifecycle,
              scopeType: change.scopeType,
              scopeId: change.scopeId,
              audience: change.audience,
            },
          },
        },
      });
    else writes.push({ Delete: { TableName: tableName, Key: key } });
    changedPartitions.add(partition);
  }
  for (const partition of changedPartitions)
    writes.push({
      Update: {
        TableName: tableName,
        Key: { PK: partition, SK: 'META' },
        UpdateExpression: 'ADD sourceEpoch :one SET updatedAt=:now',
        ExpressionAttributeValues: { ':one': 1, ':now': new Date().toISOString() },
      },
    });
  return writes;
}
