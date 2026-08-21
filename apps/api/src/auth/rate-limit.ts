import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

const resetWindowKey = (key: string) => ({ PK: `AUTHRESET#${key}`, SK: 'WINDOW' });

export async function consumeDurableWindowAttempt(
  key: string,
  limit: number,
  windowSeconds = 15 * 60,
  now = Date.now(),
) {
  const item = (
    await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: resetWindowKey(key), ConsistentRead: true }),
    )
  ).Item;
  const active = Number(item?.windowEndsAt ?? 0) > now;
  const priorCount = active ? Number(item?.count ?? 0) : 0;
  if (priorCount >= limit) return false;
  const windowEndsAt = active ? Number(item?.windowEndsAt) : now + windowSeconds * 1_000;
  try {
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...resetWindowKey(key),
          count: priorCount + 1,
          windowEndsAt,
          expiresAt: Math.ceil(windowEndsAt / 1_000),
        },
        ConditionExpression: item
          ? '#count=:priorCount AND windowEndsAt=:priorWindowEndsAt'
          : 'attribute_not_exists(PK)',
        ...(item
          ? {
              ExpressionAttributeNames: { '#count': 'count' },
              ExpressionAttributeValues: {
                ':priorCount': Number(item.count ?? 0),
                ':priorWindowEndsAt': Number(item.windowEndsAt ?? 0),
              },
            }
          : {}),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function consumePasswordResetAttempt(accountKey: string, sourceKey: string) {
  if (!(await consumeDurableWindowAttempt(`account:${accountKey}`, 5))) return false;
  return consumeDurableWindowAttempt(`source:${sourceKey}`, 20);
}
