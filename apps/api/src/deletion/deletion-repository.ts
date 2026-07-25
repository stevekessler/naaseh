import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createUlid,
  deletionJobSchema,
  type DeletionJob,
  type DeletionLedgerEntry,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export async function findDeletionJob(id: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.deletionJob(id), ConsistentRead: true }),
  );
  return result.Item?.data as DeletionJob | undefined;
}

export async function findDeletionReceipt(actorId: string, mutationId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.deletionReceipt(actorId, mutationId),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as { jobId: string; resourceId: string } | undefined;
}

export async function createDeletionJob(input: {
  resourceType: 'task' | 'list' | 'category' | 'project';
  resourceId: string;
  requestedBy: string;
  requestMutationId: string;
  targetVersion: number;
  dependencyDigest: string;
  now?: Date;
}) {
  const replay = await findDeletionReceipt(input.requestedBy, input.requestMutationId);
  if (replay) return findDeletionJob(replay.jobId);
  const timestamp = (input.now ?? new Date()).toISOString();
  const job = deletionJobSchema.parse({
    id: createUlid(input.now?.getTime()),
    ...input,
    status: 'pending',
    progress: 0,
    checkpoint: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.deletionJob(job.id), data: job },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys.deletionReceipt(input.requestedBy, input.requestMutationId),
        data: { jobId: job.id, resourceId: input.resourceId },
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return job;
}

export async function saveDeletionJob(job: DeletionJob) {
  await dynamodb.send(
    new PutCommand({ TableName: tableName, Item: { ...keys.deletionJob(job.id), data: job } }),
  );
  return job;
}

async function deleteKeys(items: { PK: string; SK: string }[]) {
  for (let offset = 0; offset < items.length; offset += 25)
    await dynamodb.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: items.slice(offset, offset + 25).map((Key) => ({ DeleteRequest: { Key } })),
        },
      }),
    );
}

export async function deletePartition(pk: string, skPrefix?: string) {
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: skPrefix ? 'PK=:pk AND begins_with(SK,:sk)' : 'PK=:pk',
        ExpressionAttributeValues: { ':pk': pk, ...(skPrefix ? { ':sk': skPrefix } : {}) },
        ProjectionExpression: 'PK,SK',
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    await deleteKeys((result.Items ?? []) as { PK: string; SK: string }[]);
    cursor = result.LastEvaluatedKey;
  } while (cursor);
}

export async function deleteCurrent(resourceType: 'task' | 'list', resourceId: string) {
  await dynamodb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: keys.entity(resourceType, resourceId),
    }),
  );
}

export async function scanReferences(resourceId: string, attributes: string[]) {
  const names = Object.fromEntries(attributes.map((name, index) => [`#a${index}`, name]));
  const clauses = attributes.map((_, index) => `#data.#a${index}=:id`);
  const result = await dynamodb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: clauses.join(' OR '),
      ExpressionAttributeNames: { '#data': 'data', ...names },
      ExpressionAttributeValues: { ':id': resourceId },
      ProjectionExpression: 'PK,SK',
    }),
  );
  return (result.Items ?? []) as { PK: string; SK: string }[];
}

export async function writeDeletionLedger(entry: DeletionLedgerEntry) {
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.deletionLedger(entry.resourceType, entry.resourceId), data: entry },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

export const removeReferenceKeys = deleteKeys;
