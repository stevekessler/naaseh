import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface TrustedDeviceRecord {
  userId: string;
  sessionEpoch: number;
  credentialVersion: number;
  tfaEnrolledAt?: string;
  expiresAt: string;
  createdAt?: string;
  lastUsedAt?: string;
  label?: string;
}

export async function saveTrustedDevice(tokenHash: string, record: TrustedDeviceRecord) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        keys.trustedDevice(tokenHash),
        keys.trustedDeviceForUser(record.userId, tokenHash),
      ].map((key) => ({
        Put: {
          TableName: tableName,
          Item: {
            ...key,
            data: record,
            expiresAt: Math.floor(new Date(record.expiresAt).getTime() / 1_000),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })),
    }),
  );
}

export async function findTrustedDevice(tokenHash: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.trustedDevice(tokenHash),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as TrustedDeviceRecord | undefined;
}

export async function deleteTrustedDevice(tokenHash: string) {
  const record = await findTrustedDevice(tokenHash);
  if (!record) return;
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        keys.trustedDevice(tokenHash),
        keys.trustedDeviceForUser(record.userId, tokenHash),
      ].map((key) => ({ Delete: { TableName: tableName, Key: key } })),
    }),
  );
}

// Records issued before the device list existed have no user-scoped index. Add it
// when that browser next signs in, without extending its original expiry.
export async function indexLegacyTrustedDevice(tokenHash: string, record: TrustedDeviceRecord) {
  try {
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...keys.trustedDeviceForUser(record.userId, tokenHash),
          data: record,
          expiresAt: Math.floor(new Date(record.expiresAt).getTime() / 1_000),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
  }
}

export async function touchTrustedDevice(userId: string, tokenHash: string, lastUsedAt: string) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.trustedDeviceForUser(userId, tokenHash),
      UpdateExpression: 'SET #data.#lastUsedAt = :lastUsedAt',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#data': 'data', '#lastUsedAt': 'lastUsedAt' },
      ExpressionAttributeValues: { ':lastUsedAt': lastUsedAt },
    }),
  );
}

export async function listTrustedDevicesForUser(userId: string) {
  const records: Array<{ id: string; record: TrustedDeviceRecord }> = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'TRUSTEDDEVICE#' },
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of result.Items ?? []) {
      if (typeof item.SK === 'string' && item.data)
        records.push({
          id: item.SK.slice('TRUSTEDDEVICE#'.length),
          record: item.data as TrustedDeviceRecord,
        });
    }
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return records;
}

export async function revokeTrustedDeviceForUser(userId: string, tokenHash: string) {
  const indexKey = keys.trustedDeviceForUser(userId, tokenHash);
  const indexed = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: indexKey, ConsistentRead: true }),
  );
  if (!indexed.Item) return false;
  try {
    await dynamodb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: tableName,
              Key: indexKey,
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          { Delete: { TableName: tableName, Key: keys.trustedDevice(tokenHash) } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'TransactionCanceledException') return false;
    throw error;
  }
}

export async function renameTrustedDeviceForUser(userId: string, tokenHash: string, label: string) {
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: keys.trustedDeviceForUser(userId, tokenHash),
        UpdateExpression: 'SET #data.#label = :label',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#data': 'data', '#label': 'label' },
        ExpressionAttributeValues: { ':label': label },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}
