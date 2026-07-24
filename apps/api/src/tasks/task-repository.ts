import { createUlid, type Task, type TaskRevision } from '@naaseh/domain';
import { commitTask, getRecord } from '../shared/store.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
import { administratorTaskFeedChange, privacyFeedChanges } from './privacy-transition.js';
import { keys } from '../shared/keys.js';

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
  getRecord<{ data: Task }>(`TASK#${id}`, 'CURRENT').then((item) => item?.data);

const revisionFieldAllowlist = new Set<keyof Task>([
  'link',
  'dueAt',
  'dueTimeZone',
  'assigneeId',
  'categoryId',
  'groupId',
  'parentId',
  'visibility',
  'status',
  'completedAt',
  'completedBy',
  'version',
]);

function safeRevisionValues(task: Task | undefined, changedFields: string[]) {
  if (!task) return undefined;
  return Object.fromEntries(
    changedFields
      .filter((field) => revisionFieldAllowlist.has(field as keyof Task))
      .map((field) => [field, task[field as keyof Task] ?? null]),
  ) as TaskRevision['after'];
}
export async function saveTaskMutation(
  task: Task,
  actorId: string,
  mutationId: string,
  operation: TaskRevision['operation'],
  changedFields: string[],
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
    changedFields,
    ...(sourceClientId ? { sourceClientId } : {}),
    ...(previous ? { before: safeRevisionValues(previous, changedFields) } : {}),
    after: safeRevisionValues(task, changedFields) ?? {},
    syncOutcome: 'applied',
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const feedChanges = privacyFeedChanges(previous, task);
    if (dependencies.administratorFeed) feedChanges.push(administratorTaskFeedChange(task));
    const changes = await Promise.all(feedChanges.map(dependencies.prepareChange));
    try {
      await dependencies.commit(task, revision, mutationId, changes);
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
export async function listRevisions(taskId: string): Promise<TaskRevision[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK=:pk AND begins_with(SK,:rev)',
      ExpressionAttributeValues: { ':pk': `TASK#${taskId}`, ':rev': 'REV#' },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []).map((item) => item.data as TaskRevision);
}
