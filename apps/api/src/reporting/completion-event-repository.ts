import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { matchesUrgencySet, type CompletionEvent, type Urgency } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import { getRecord } from '../shared/store.js';
import {
  createPaginationCursorPayload,
  decodePaginationCursor,
  encodePaginationCursor,
  validatePaginationCursorContext,
  type PaginationCursorContext,
} from '../shared/pagination-cursor.js';

export async function getCompletionEvent(id: string) {
  const key = keys.completionEventById(id);
  return (await getRecord<{ data: CompletionEvent }>(key.PK, key.SK))?.data;
}

export async function putCompletionEvent(event: CompletionEvent) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionEventById(event.id),
              data: event,
              GSI1PK: `COMPLETIONS#USER#${event.completedBy}`,
              GSI1SK: `${event.occurredAt}#${event.id}`,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionDetail(event.completedBy, event.occurredAt, event.id),
              data: event,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.completionEvent(event.taskId, event.occurredAt, event.id),
              data: event,
            },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: { PK: `COMPLETIONDETAIL#USER#${event.completedBy}`, SK: 'META' },
            UpdateExpression: 'ADD sourceEpoch :one SET updatedAt=:now',
            ExpressionAttributeValues: { ':one': 1, ':now': event.occurredAt },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: keys.completionProjection(
              event.completedBy,
              event.occurredAt.slice(0, 10),
              event.categoryIdAtCompletion ?? 'unassigned',
              event.projectIdAtCompletion ?? 'unassigned',
            ),
            UpdateExpression: 'ADD #count :delta, #urgency :delta SET updatedAt=:now',
            ExpressionAttributeNames: {
              '#count': 'count',
              '#urgency': `urgency_${event.urgencyAtCompletion}`,
            },
            ExpressionAttributeValues: {
              ':delta': event.counted ? 1 : -1,
              ':now': event.occurredAt,
            },
          },
        },
      ],
    }),
  );
  return event;
}

export async function listCompletionEventsForUser(completedBy: string) {
  const events: CompletionEvent[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK=:user',
        ExpressionAttributeValues: {
          ':user': `COMPLETIONS#USER#${completedBy}`,
        },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }),
    );
    events.push(...(result.Items ?? []).map((item) => item.data as CompletionEvent));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return events;
}

export interface CompletionDetailQuery {
  actorId: string;
  targetUserId: string;
  accessEpoch: number;
  from?: string;
  to?: string;
  categoryId?: string | 'unassigned';
  projectId?: string | 'unassigned';
  urgencies?: readonly Urgency[];
  cursor?: string;
  limit: number;
  now?: Date;
}

const detailMatches = (event: CompletionEvent, input: CompletionDetailQuery, asOf: string) => {
  if (event.occurredAt > asOf) return false;
  if (!event.counted && (!event.reversedAt || event.reversedAt <= asOf)) return false;
  const date = event.occurredAt.slice(0, 10);
  if (input.from && date < input.from) return false;
  if (input.to && date > input.to) return false;
  if (input.projectId === 'unassigned' && event.projectIdAtCompletion) return false;
  if (
    input.projectId &&
    input.projectId !== 'unassigned' &&
    event.projectIdAtCompletion !== input.projectId
  )
    return false;
  if (input.categoryId === 'unassigned' && event.categoryIdAtCompletion) return false;
  if (
    input.categoryId &&
    input.categoryId !== 'unassigned' &&
    event.categoryIdAtCompletion !== input.categoryId
  )
    return false;
  return matchesUrgencySet(event.urgencyAtCompletion, input.urgencies);
};

export async function readCompletionDetailPage(input: CompletionDetailQuery) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200)
    throw new Error('Page limit must be between 1 and 200.');
  const decoded = input.cursor ? decodePaginationCursor(input.cursor) : undefined;
  const asOf = decoded?.tailWatermark ?? (input.now ?? new Date()).toISOString();
  const meta = await getRecord<{ sourceEpoch?: number }>(
    `COMPLETIONDETAIL#USER#${input.targetUserId}`,
    'META',
  );
  const context: PaginationCursorContext = {
    actorId: input.actorId,
    accessEpoch: input.accessEpoch,
    endpoint: 'completion_drilldown',
    scope: `user:${input.targetUserId}`,
    orderBy: 'completedAt_desc',
    filters: {
      from: input.from,
      to: input.to,
      categoryId: input.categoryId,
      projectId: input.projectId,
      urgencies: input.urgencies,
    },
    sourceEpochs: { completion: meta?.sourceEpoch ?? 0 },
    tailWatermark: asOf,
    now: (input.now ?? new Date()).valueOf(),
  };
  if (decoded) validatePaginationCursorContext(decoded, context);

  const events: CompletionEvent[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK=:pk AND begins_with(SK,:event)',
        ExpressionAttributeValues: {
          ':pk': `COMPLETIONDETAIL#USER#${input.targetUserId}`,
          ':event': 'EVENT#',
        },
        ScanIndexForward: false,
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }),
    );
    events.push(...(result.Items ?? []).map((item) => item.data as CompletionEvent));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const start = decoded?.nextIndex ?? 0;
  const budget = Math.max(500, Math.min(4_000, input.limit * 20));
  const items: Array<{
    eventId: string;
    workId: string;
    workType: 'task';
    completedAt: string;
    urgencyAtCompletion: Urgency;
    categoryId?: string;
    projectId?: string;
    reversedAt?: string;
  }> = [];
  let nextIndex = start;
  while (nextIndex < events.length && nextIndex - start < budget && items.length < input.limit) {
    const event = events[nextIndex++]!;
    if (!detailMatches(event, input, asOf)) continue;
    items.push({
      eventId: event.id,
      workId: event.taskId,
      workType: 'task',
      completedAt: event.occurredAt,
      urgencyAtCompletion: event.urgencyAtCompletion,
      ...(event.categoryIdAtCompletion ? { categoryId: event.categoryIdAtCompletion } : {}),
      ...(event.projectIdAtCompletion ? { projectId: event.projectIdAtCompletion } : {}),
      ...(event.reversedAt ? { reversedAt: event.reversedAt } : {}),
    });
  }
  return {
    asOf,
    items,
    nextCursor:
      nextIndex < events.length
        ? encodePaginationCursor(createPaginationCursorPayload(context, nextIndex))
        : null,
  };
}
