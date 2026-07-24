import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { EntityRevision, StableMutationResult, Task, TaskRevision } from '@naaseh/domain';
import type { PreparedFeedChange } from '../sync/change-feed-repository.js';
import { keys } from './keys.js';

const document = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.NAASEH_TABLE ?? 'naaseh-local';
export async function getRecord<T>(pk: string, sk: string): Promise<T | undefined> {
  const result = await document.send(
    new GetCommand({ TableName: table, Key: { PK: pk, SK: sk }, ConsistentRead: true }),
  );
  return result.Item as T | undefined;
}
export async function putRecord(
  item: Record<string, unknown>,
  condition?: string,
  names?: Record<string, string>,
  values?: Record<string, unknown>,
): Promise<void> {
  await document.send(
    new PutCommand({
      TableName: table,
      Item: item,
      ...(condition ? { ConditionExpression: condition } : {}),
      ...(names ? { ExpressionAttributeNames: names } : {}),
      ...(values ? { ExpressionAttributeValues: values } : {}),
    }),
  );
}
export async function listPublicTasks(): Promise<Task[]> {
  const result = await document.send(
    new QueryCommand({
      TableName: table,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'TASK#PUBLIC' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as Task);
}
export async function listOwnerTasks(ownerId: string): Promise<Task[]> {
  const result = await document.send(
    new QueryCommand({
      TableName: table,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `TASK#OWNER#${ownerId}` },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as Task);
}
export function buildTaskTransaction(
  task: Task,
  revision: TaskRevision,
  mutationId: string,
  feedChanges: PreparedFeedChange[] = [],
): TransactWriteCommandInput {
  return {
    TransactItems: [
      {
        Put: {
          TableName: table,
          Item: {
            PK: `TASK#${task.id}`,
            SK: 'CURRENT',
            GSI1PK: task.visibility === 'public' ? 'TASK#PUBLIC' : `TASK#OWNER#${task.ownerId}`,
            GSI1SK: task.updatedAt,
            data: task,
          },
          ConditionExpression: 'attribute_not_exists(PK) OR #data.#version = :base',
          ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
          ExpressionAttributeValues: { ':base': task.version - 1 },
        },
      },
      {
        Put: {
          TableName: table,
          Item: {
            PK: `TASK#${task.id}`,
            SK: `REV#${revision.version.toString().padStart(12, '0')}#${revision.id}`,
            data: revision,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: table,
          Item: {
            ...keys.mutation(task.ownerId, mutationId),
            taskId: task.id,
            version: task.version,
            data: {
              mutationId,
              status: 'applied',
              entityVersion: task.version,
              entity: task,
            },
            expiresAt: Math.floor(Date.now() / 1000) + 2_592_000,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...feedChanges.flatMap(({ change, expectedSequence }) => [
        {
          Update: {
            TableName: table,
            Key: { PK: `FEED#${change.audience}`, SK: 'COUNTER' },
            UpdateExpression: 'SET #value=:next',
            ConditionExpression: 'attribute_not_exists(#value) OR #value=:expected',
            ExpressionAttributeNames: { '#value': 'value' },
            ExpressionAttributeValues: { ':next': change.sequence, ':expected': expectedSequence },
          },
        },
        {
          Put: {
            TableName: table,
            Item: {
              PK: `FEED#${change.audience}`,
              SK: `CHANGE#${String(change.sequence).padStart(20, '0')}`,
              data: change,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ]),
    ],
  };
}
export async function commitTask(
  task: Task,
  revision: TaskRevision,
  mutationId: string,
  feedChanges: PreparedFeedChange[] = [],
): Promise<void> {
  await document.send(
    new TransactWriteCommand(buildTaskTransaction(task, revision, mutationId, feedChanges)),
  );
}

export interface GenericCurrentRecord<T = unknown> {
  PK: string;
  SK: 'CURRENT';
  data: T;
  version: number;
  GSI1PK?: string;
  GSI1SK?: string;
}

export interface GenericTransactionInput<T> {
  current: GenericCurrentRecord<T>;
  revision: EntityRevision;
  actorId: string;
  mutationResult: StableMutationResult;
  expectedVersion: number;
  feedChanges?: PreparedFeedChange[];
  checkpoints?: Record<string, unknown>[];
}

export function buildEntityTransaction<T>(
  input: GenericTransactionInput<T>,
): TransactWriteCommandInput {
  const mutationKey = keys.mutation(input.actorId, input.mutationResult.mutationId);
  return {
    TransactItems: [
      {
        Put: {
          TableName: table,
          Item: input.current,
          ConditionExpression: 'attribute_not_exists(PK) OR #version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.expectedVersion },
        },
      },
      {
        Put: {
          TableName: table,
          Item: {
            ...keys.entityRevision(
              input.revision.entityType,
              input.revision.entityId,
              input.revision.version,
              input.revision.id,
            ),
            data: input.revision,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: table,
          Item: {
            ...mutationKey,
            data: input.mutationResult,
            expiresAt: Math.floor(Date.now() / 1000) + 2_592_000,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...(input.feedChanges ?? []).flatMap(({ change, expectedSequence }) => [
        {
          Update: {
            TableName: table,
            Key: { PK: `FEED#${change.audience}`, SK: 'COUNTER' },
            UpdateExpression: 'SET #value=:next',
            ConditionExpression: 'attribute_not_exists(#value) OR #value=:expected',
            ExpressionAttributeNames: { '#value': 'value' },
            ExpressionAttributeValues: { ':next': change.sequence, ':expected': expectedSequence },
          },
        },
        {
          Put: {
            TableName: table,
            Item: {
              PK: `FEED#${change.audience}`,
              SK: `CHANGE#${String(change.sequence).padStart(20, '0')}`,
              data: change,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ]),
      ...(input.checkpoints ?? []).map((item) => ({
        Put: { TableName: table, Item: item },
      })),
    ],
  };
}

export async function commitEntity<T>(input: GenericTransactionInput<T>): Promise<void> {
  await document.send(new TransactWriteCommand(buildEntityTransaction(input)));
}
