import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface RecoveryCodeDigest {
  id: string;
  digest: string;
  usedAt?: string;
}

export interface TfaFactorRecord {
  userId: string;
  status: 'enabled' | 'recovery_required';
  secretCiphertext?: string;
  lastAcceptedCounter?: number;
  recoveryCodes: RecoveryCodeDigest[];
  verifiedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function getTfaFactor(userId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.tfaFactor(userId), ConsistentRead: true }),
  );
  return result.Item?.data as TfaFactorRecord | undefined;
}

export async function putTfaFactor(factor: TfaFactorRecord) {
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.tfaFactor(factor.userId), data: factor },
      ConditionExpression: 'attribute_not_exists(PK) OR #data.#version < :version',
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: { ':version': factor.version },
    }),
  );
}

export async function advanceAcceptedCounter(
  userId: string,
  expectedVersion: number,
  counter: number,
) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.tfaFactor(userId),
      UpdateExpression:
        'SET #data.lastAcceptedCounter=:counter, #data.#version=:nextVersion, #data.updatedAt=:now',
      ConditionExpression:
        '#data.#version=:expectedVersion AND (attribute_not_exists(#data.lastAcceptedCounter) OR #data.lastAcceptedCounter < :counter)',
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: {
        ':counter': counter,
        ':expectedVersion': expectedVersion,
        ':nextVersion': expectedVersion + 1,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

export async function deleteTfaFactor(userId: string) {
  await dynamodb.send(new DeleteCommand({ TableName: tableName, Key: keys.tfaFactor(userId) }));
}
