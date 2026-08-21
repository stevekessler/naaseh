import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { taskTimerSchema, type TaskTimer } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface TaskTimerReceipt {
  mutationId: string;
  status: 'applied';
  version: number;
}

export interface TaskTimerCommit {
  ownerId: string;
  mutationId: string;
  baseVersion: number;
  timer: TaskTimer;
  expectedFeedSequence: number;
}

export function buildTaskTimerTransaction(input: TaskTimerCommit) {
  const currentKey = keys.taskTimer(input.ownerId);
  const condition =
    input.baseVersion === 0 ? 'attribute_not_exists(PK)' : '#data.#version = :baseVersion';
  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: { ...currentKey, data: input.timer },
          ConditionExpression: condition,
          ...(input.baseVersion === 0
            ? {}
            : {
                ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
                ExpressionAttributeValues: { ':baseVersion': input.baseVersion },
              }),
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...keys.taskTimerRevision(input.ownerId, input.timer.version, input.timer.runId),
            data: input.timer,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...keys.taskTimerReceipt(input.ownerId, input.mutationId),
            data: {
              mutationId: input.mutationId,
              status: 'applied',
              version: input.timer.version,
            } satisfies TaskTimerReceipt,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName: tableName,
          Key: keys.taskTimerOwnerFeedCounter(input.ownerId),
          UpdateExpression: 'SET sequence = :next',
          ConditionExpression: 'attribute_not_exists(sequence) OR sequence = :expected',
          ExpressionAttributeValues: {
            ':expected': input.expectedFeedSequence,
            ':next': input.expectedFeedSequence + 1,
          },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...keys.taskTimerOwnerFeedEntry(input.ownerId, input.expectedFeedSequence + 1),
            data: {
              audience: `OWNER#${input.ownerId}`,
              sequence: input.expectedFeedSequence + 1,
              entityType: 'taskTimer',
              entityId: input.ownerId,
              version: input.timer.version,
              operation: 'upsert',
              payload: input.timer,
              changedAt: input.timer.updatedAt,
            },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ],
  };
}

export async function getTaskTimer(ownerId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.taskTimer(ownerId), ConsistentRead: true }),
  );
  return result.Item?.data ? taskTimerSchema.parse(result.Item.data) : undefined;
}

export async function getTaskTimerReceipt(ownerId: string, mutationId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.taskTimerReceipt(ownerId, mutationId),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as TaskTimerReceipt | undefined;
}

export async function getTaskTimerFeedSequence(ownerId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.taskTimerOwnerFeedCounter(ownerId),
      ConsistentRead: true,
    }),
  );
  return Number(result.Item?.sequence ?? 0);
}

export async function commitTaskTimer(input: TaskTimerCommit) {
  await dynamodb.send(new TransactWriteCommand(buildTaskTimerTransaction(input)));
}
