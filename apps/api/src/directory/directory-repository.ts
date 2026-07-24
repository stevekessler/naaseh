import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createUlid,
  type EntityRevision,
  type GlobalDirectoryItem,
  type StableMutationResult,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { commitEntity, getRecord } from '../shared/store.js';
export async function findDirectoryItem(id: string) {
  return (await getRecord<{ data: GlobalDirectoryItem }>(`DIRECTORY#${id}`, 'CURRENT'))?.data;
}
export async function listDirectoryItems(limit = 100) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': 'DIRECTORY#ACTIVE' },
      Limit: Math.min(200, Math.max(1, limit)),
    }),
  );
  return (result.Items ?? []).map((item) => item.data as GlobalDirectoryItem);
}
export async function saveDirectoryItemRecord(
  value: GlobalDirectoryItem,
  actorId: string,
  mutationId: string,
  expectedVersion: number,
  feedChanges: Parameters<typeof commitEntity>[0]['feedChanges'] = [],
) {
  const revision: EntityRevision = {
    id: createUlid(),
    entityType: 'directoryItem',
    entityId: value.id,
    mutationId,
    actorId,
    version: value.version,
    changedAt: value.updatedAt,
    operation: expectedVersion ? 'update' : 'create',
    changedFields: ['name', 'amountMinor', 'status'],
    after: { amountMinor: value.amountMinor, status: value.status },
    syncOutcome: 'applied',
  };
  const mutationResult: StableMutationResult = {
    mutationId,
    status: 'applied',
    version: value.version,
  };
  await commitEntity({
    current: {
      PK: `DIRECTORY#${value.id}`,
      SK: 'CURRENT',
      data: value,
      version: value.version,
      GSI1PK: `DIRECTORY#${value.status.toUpperCase()}`,
      GSI1SK: `${value.name.toLocaleLowerCase()}#${value.id}`,
    },
    revision,
    actorId,
    mutationResult,
    expectedVersion,
    feedChanges,
  });
  return value;
}
