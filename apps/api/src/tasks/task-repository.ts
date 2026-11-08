import {
  createUlid,
  type CompletionEvent,
  type Task,
  type TaskRevision,
  contentAudienceFor,
  taskSchema,
  taskRevisionChanges,
} from '@naaseh/domain';
import { commitTask, getRecord } from '../shared/store.js';
import { paginateQuery, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
import { administratorTaskFeedChange, privacyFeedChanges } from './privacy-transition.js';
import { keys } from '../shared/keys.js';
import {
  workloadProjectionChanges,
  workloadProjectionWrites,
} from '../reporting/workload-projection-repository.js';
import {
  workViewProjectionChanges,
  workViewProjectionWrites,
  type ProjectedWorkView,
} from '../reporting/work-view-repository.js';

const projectedTask = (task: Task | undefined): ProjectedWorkView | undefined =>
  task
    ? {
        id: task.id,
        workType: 'task' as const,
        audience: contentAudienceFor({
          ownerId: task.ownerId,
          locked: task.visibility === 'private',
        }).ordinary,
        audiences: [
          `OWNER#${task.ownerId}`,
          task.visibility === 'private' ? `OWNER#${task.ownerId}` : 'PUBLIC',
        ],
        lifecycle: task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active'),
        ...(task.projectId ? { projectId: task.projectId } : {}),
        ...(task.categoryId ? { categoryId: task.categoryId } : {}),
        urgency: task.urgency,
        sortKey: task.updatedAt,
      }
    : undefined;

/** Shared projections used by compound task commands that must commit atomically. */
export function taskProjectionWrites(task: Task, previous?: Task) {
  return [
    ...workloadProjectionWrites(
      workloadProjectionChanges(projectedTask(previous), projectedTask(task)),
    ),
    ...workViewProjectionWrites(
      workViewProjectionChanges(projectedTask(previous), projectedTask(task)),
    ),
  ];
}

export interface StoredTaskMutationResult {
  mutationId: string;
  status: 'applied';
  entityVersion: number;
  entity: Task;
}

export interface TaskMutationDependencies {
  prepareChange: typeof prepareAudienceChange;
  commit: typeof commitTask;
  findResult: (
    mutationId: string,
    actorId: string,
  ) => Promise<StoredTaskMutationResult | undefined>;
  administratorFeed?: boolean;
}

async function findStoredMutationResult(
  mutationId: string,
  actorId: string,
): Promise<StoredTaskMutationResult | undefined> {
  const key = keys.mutation(actorId, mutationId);
  const item = await getRecord<{ data?: StoredTaskMutationResult }>(key.PK, key.SK);
  return item?.data;
}

const defaultDependencies: TaskMutationDependencies = {
  prepareChange: prepareAudienceChange,
  commit: commitTask,
  findResult: findStoredMutationResult,
  administratorFeed: true,
};
export const findTask = (id: string) =>
  getRecord<{ data: Task }>(`TASK#${id}`, 'CURRENT').then((item) =>
    item ? taskSchema.parse(item.data) : undefined,
  );

export async function saveTaskMutation(
  task: Task,
  actorId: string,
  mutationId: string,
  operation: TaskRevision['operation'],
  previous?: Task,
  dependencies: TaskMutationDependencies = defaultDependencies,
  sourceClientId?: string,
) {
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId,
    actorId,
    version: task.version,
    changedAt: task.updatedAt,
    operation,
    ...taskRevisionChanges(task, previous),
    ...(sourceClientId ? { sourceClientId } : {}),
    syncOutcome: 'applied',
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const feedChanges = privacyFeedChanges(previous, task);
    if (dependencies.administratorFeed) feedChanges.push(administratorTaskFeedChange(task));
    const changes = await Promise.all(feedChanges.map(dependencies.prepareChange));
    try {
      await dependencies.commit(task, revision, mutationId, changes, [
        ...workloadProjectionWrites(
          workloadProjectionChanges(projectedTask(previous), projectedTask(task)),
        ),
        ...workViewProjectionWrites(
          workViewProjectionChanges(projectedTask(previous), projectedTask(task)),
        ),
      ]);
      return { task, revision, replayed: false };
    } catch (error) {
      lastError = error;
      // A concurrent identical request may have committed after our initial
      // replay read. Return its durable result instead of misreporting failure.
      const replay = await dependencies.findResult(mutationId, actorId);
      if (replay)
        return {
          task: replay.entity,
          revision,
          replayed: true,
        };
    }
  }
  throw lastError;
}
function revisionQuery(taskId: string) {
  return {
    TableName: tableName,
    KeyConditionExpression: 'PK=:pk AND begins_with(SK,:rev)',
    ExpressionAttributeValues: { ':pk': `TASK#${taskId}`, ':rev': 'REV#' },
    ConsistentRead: true,
  };
}

export async function countTaskRevisions(taskId: string) {
  let count = 0;
  for await (const page of paginateQuery(
    { client: dynamodb },
    { ...revisionQuery(taskId), Select: 'COUNT' },
  ))
    count += page.Count ?? 0;
  return count;
}

export async function listRevisions(taskId: string, limit: number, cursor?: string) {
  const PK = `TASK#${taskId}`;
  const result = await dynamodb.send(
    new QueryCommand({
      ...revisionQuery(taskId),
      ScanIndexForward: false,
      Limit: limit,
      ...(cursor ? { ExclusiveStartKey: { PK, SK: cursor } } : {}),
    }),
  );
  return {
    items: (result.Items ?? []).map((item) => item.data as TaskRevision),
    cursor: typeof result.LastEvaluatedKey?.SK === 'string' ? result.LastEvaluatedKey.SK : null,
  };
}

export async function findCompletionEvent(id: string) {
  const key = keys.completionEventById(id);
  return (await getRecord<{ data: CompletionEvent }>(key.PK, key.SK))?.data;
}

export async function saveTaskLifecycleMutation(
  task: Task,
  previous: Task,
  actorId: string,
  mutationId: string,
  operation: 'completeAndArchive' | 'archive' | 'reopenAndRestore',
  completionEvent?: CompletionEvent,
  sourceClientId?: string,
) {
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId,
    actorId,
    version: task.version,
    changedAt: task.updatedAt,
    operation,
    ...taskRevisionChanges(task, previous),
    syncOutcome: 'applied',
    ...(sourceClientId ? { sourceClientId } : {}),
  };
  const intents = privacyFeedChanges(previous, task);
  if (defaultDependencies.administratorFeed) intents.push(administratorTaskFeedChange(task));
  const feedChanges = await Promise.all(intents.map(prepareAudienceChange));
  const additionalWrites = completionEvent
    ? [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionEventById(completionEvent.id),
              data: completionEvent,
              GSI1PK: `COMPLETIONS#USER#${completionEvent.completedBy}`,
              GSI1SK: `${completionEvent.occurredAt}#${completionEvent.id}`,
            },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: {
              PK: `COMPLETIONDETAIL#USER#${completionEvent.completedBy}`,
              SK: 'META',
            },
            UpdateExpression: 'ADD sourceEpoch :one SET updatedAt=:now',
            ExpressionAttributeValues: { ':one': 1, ':now': task.updatedAt },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: keys.completionProjection(
              completionEvent.completedBy,
              completionEvent.occurredAt.slice(0, 10),
              completionEvent.categoryIdAtCompletion ?? 'unassigned',
              completionEvent.projectIdAtCompletion ?? 'unassigned',
            ),
            UpdateExpression: 'ADD #count :delta, #urgency :delta SET updatedAt=:now',
            ExpressionAttributeNames: {
              '#count': 'count',
              '#urgency': `urgency_${completionEvent.urgencyAtCompletion}`,
            },
            ExpressionAttributeValues: {
              ':delta': completionEvent.counted ? 1 : -1,
              ':now': task.updatedAt,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionDetail(
                completionEvent.completedBy,
                completionEvent.occurredAt,
                completionEvent.id,
              ),
              data: completionEvent,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionEvent(
                completionEvent.taskId,
                completionEvent.occurredAt,
                completionEvent.id,
              ),
              data: completionEvent,
            },
          },
        },
      ]
    : [];
  await commitTask(task, revision, mutationId, feedChanges, [
    ...additionalWrites,
    ...workloadProjectionWrites(
      workloadProjectionChanges(projectedTask(previous), projectedTask(task)),
    ),
    ...workViewProjectionWrites(
      workViewProjectionChanges(projectedTask(previous), projectedTask(task)),
    ),
  ]);
  return { task, revision, completionEvent, replayed: false };
}
