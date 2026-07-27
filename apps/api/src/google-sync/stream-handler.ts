import type { DynamoDBStreamHandler } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { googleSyncOperationSchema, taskSchema } from '@naaseh/domain';
import { findGoogleConnection, saveGoogleOperation } from './repository.js';

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    const image = record.dynamodb?.NewImage;
    if (!image) continue;
    const item = unmarshall(image as never) as { SK?: string; data?: unknown };
    if (item.SK !== 'CURRENT') continue;
    const task = taskSchema.safeParse(item.data);
    if (!task.success) continue;
    const connection = await findGoogleConnection(task.data.ownerId);
    if (!connection || connection.state === 'disconnected' || connection.state === 'connecting')
      continue;
    const now = new Date().toISOString();
    const operation = googleSyncOperationSchema.parse({
      id: `local:${task.data.id}:${task.data.version}`,
      connectionId: connection.id,
      userId: connection.userId,
      taskId: task.data.id,
      direction: 'toGoogle',
      type: task.data.lifecycle === 'archived' ? 'archive' : 'update',
      expectedLocalVersion: task.data.version,
      state: 'pending',
      attemptCount: 0,
      correlationId: `task-stream:${task.data.id}:${task.data.version}`,
      createdAt: now,
      updatedAt: now,
    });
    await saveGoogleOperation(operation).catch((error) => {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
    });
  }
};
