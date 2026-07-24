import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { UserRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
export interface StoredUser extends UserRecord {
  passwordHash: string;
  pinHash: string;
  pepperVersion: string;
}
export const canonicalUsername = (value: string) =>
  value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
export async function userByUsername(username: string): Promise<StoredUser | undefined> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.username(canonicalUsername(username)),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as StoredUser | undefined;
}
export async function userById(id: string): Promise<StoredUser | undefined> {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.user(id), ConsistentRead: true }),
  );
  return result.Item?.data as StoredUser | undefined;
}
export async function userByProvisionToken(token: string): Promise<StoredUser | undefined> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.provisionRequest(token),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as StoredUser | undefined;
}
export async function putUser(user: StoredUser, idempotencyToken?: string): Promise<void> {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { ...keys.username(user.username), data: user },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.user(user.id),
              GSI1PK: 'ADMIN#USER',
              GSI1SK: `${user.username}#${user.id}`,
              data: user,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        ...(idempotencyToken
          ? [
              {
                Put: {
                  TableName: tableName,
                  Item: { ...keys.provisionRequest(idempotencyToken), data: user },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ]
          : []),
      ],
    }),
  );
}
