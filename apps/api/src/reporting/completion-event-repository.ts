import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { type CompletionEvent } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import { getRecord } from '../shared/store.js';

export async function getCompletionEvent(id: string) {
  const key = keys.completionEventById(id);
  return (await getRecord<{ data: CompletionEvent }>(key.PK, key.SK))?.data;
}

export async function putCompletionEvent(event: CompletionEvent) {
  await Promise.all([
    dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...keys.completionEventById(event.id), data: event },
      }),
    ),
    dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...keys.completionEvent(event.taskId, event.occurredAt, event.id), data: event },
      }),
    ),
  ]);
  return event;
}

export async function listCompletionEventsForUser(completedBy: string) {
  const events: CompletionEvent[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK,:prefix) AND SK=:event AND #data.#completedBy=:user',
        ExpressionAttributeNames: { '#data': 'data', '#completedBy': 'completedBy' },
        ExpressionAttributeValues: {
          ':prefix': 'COMPLETION#',
          ':event': 'EVENT',
          ':user': completedBy,
        },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }),
    );
    events.push(...(result.Items ?? []).map((item) => item.data as CompletionEvent));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return events;
}
