import { DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';

const failures = new Map<string, { count: number; nextAt: number }>();
export const failureDelay = (count: number) => Math.min(60_000, 250 * 2 ** Math.min(count, 10));
export function registerFailure(key: string, now = Date.now()) {
  const count = Math.min((failures.get(key)?.count ?? 0) + 1, 10);
  const delayMs = failureDelay(count);
  failures.set(key, { count, nextAt: now + delayMs });
  return delayMs;
}
export const canAttempt = (key: string, now = Date.now()) =>
  (failures.get(key)?.nextAt ?? 0) <= now;
export const clearFailures = (key: string) => failures.delete(key);
const durableKey = (key: string) => ({ PK: `AUTHFAIL#${key}`, SK: 'COUNTER' });
export async function durableCanAttempt(key: string, now = Date.now()) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: durableKey(key), ConsistentRead: true }),
  );
  return Number(result.Item?.nextAt ?? 0) <= now;
}
export async function registerDurableFailure(key: string, now = Date.now()) {
  const updated = await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: durableKey(key),
      UpdateExpression: 'ADD #count :one SET expiresAt=:ttl',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': Math.floor(now / 1000) + 3600 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const delayMs = failureDelay(Number(updated.Attributes?.count ?? 1));
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: durableKey(key),
      UpdateExpression: 'SET nextAt=:next',
      ExpressionAttributeValues: { ':next': now + delayMs },
    }),
  );
  return delayMs;
}
export const clearDurableFailures = (key: string) =>
  dynamodb.send(new DeleteCommand({ TableName: tableName, Key: durableKey(key) }));
