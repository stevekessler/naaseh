import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createUlid,
  type EntityRevision,
  type List,
  type ListItem,
  type StableMutationResult,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { commitEntity, getRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';
export async function findList(id: string) {
  return (await getRecord<{ data: List }>(`LIST#${id}`, 'CURRENT'))?.data;
}
export async function findListItem(id: string) {
  return (await getRecord<{ data: ListItem }>(`LISTITEM#${id}`, 'CURRENT'))?.data;
}
export async function listItemsForList(listId: string) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': `LISTITEMS#${listId}` },
    }),
  );
  return (result.Items ?? [])
    .map((item) => item.data as ListItem)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id));
}
function revision(
  entityType: 'list' | 'listItem',
  entityId: string,
  actorId: string,
  version: number,
  operation: EntityRevision['operation'],
  changedFields: string[],
  changedAt: string,
  mutationId: string,
): EntityRevision {
  return {
    id: createUlid(),
    entityType,
    entityId,
    mutationId,
    actorId,
    version,
    changedAt,
    operation,
    changedFields,
    after: Object.fromEntries(
      changedFields
        .filter((field) => ['locked', 'status', 'orderKey', 'groupId', 'version'].includes(field))
        .map((field) => [field, field === 'version' ? version : null]),
    ),
    syncOutcome: 'applied',
  };
}
export async function saveList(
  value: List,
  actorId: string,
  mutationId: string,
  operation: EntityRevision['operation'],
  changedFields: string[],
  expectedVersion: number,
  feedChanges: Parameters<typeof commitEntity>[0]['feedChanges'] = [],
) {
  const result: StableMutationResult = { mutationId, status: 'applied', version: value.version };
  await commitEntity({
    current: {
      PK: keys.list(value.id).PK,
      SK: 'CURRENT',
      data: value,
      version: value.version,
      GSI1PK: `LIST#OWNER#${value.ownerId}`,
      GSI1SK: value.updatedAt,
    },
    revision: revision(
      'list',
      value.id,
      actorId,
      value.version,
      operation,
      changedFields,
      value.updatedAt,
      mutationId,
    ),
    actorId,
    mutationResult: result,
    expectedVersion,
    feedChanges,
  });
  return value;
}
export async function saveListItem(
  value: ListItem,
  actorId: string,
  mutationId: string,
  operation: EntityRevision['operation'],
  changedFields: string[],
  expectedVersion: number,
  feedChanges: Parameters<typeof commitEntity>[0]['feedChanges'] = [],
) {
  const result: StableMutationResult = { mutationId, status: 'applied', version: value.version };
  await commitEntity({
    current: {
      PK: keys.listItem(value.id).PK,
      SK: 'CURRENT',
      data: value,
      version: value.version,
      GSI1PK: `LISTITEMS#${value.listId}`,
      GSI1SK: `${value.orderKey}#${value.id}`,
    },
    revision: revision(
      'listItem',
      value.id,
      actorId,
      value.version,
      operation,
      changedFields,
      value.updatedAt,
      mutationId,
    ),
    actorId,
    mutationResult: result,
    expectedVersion,
    feedChanges,
  });
  return value;
}
