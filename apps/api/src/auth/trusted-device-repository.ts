import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface TrustedDeviceRecord {
  userId: string;
  sessionEpoch: number;
  credentialVersion: number;
  tfaEnrolledAt?: string;
  expiresAt: string;
}

export async function saveTrustedDevice(tokenHash: string, record: TrustedDeviceRecord) {
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys.trustedDevice(tokenHash),
        data: record,
        expiresAt: Math.floor(new Date(record.expiresAt).getTime() / 1_000),
      },
      ConditionExpression: 'attribute_not_exists(PK)',
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
  await dynamodb.send(
    new DeleteCommand({ TableName: tableName, Key: keys.trustedDevice(tokenHash) }),
  );
}
