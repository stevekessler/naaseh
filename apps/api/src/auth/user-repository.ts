import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { userSchema, usernameLookupSchema, type UserRecord } from '@naaseh/domain';
import { z } from 'zod';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
export interface StoredUser extends UserRecord {
  passwordHash: string;
  pinHash: string;
  pepperVersion: string;
}
const storedUserSchema = userSchema
  .extend({
    passwordHash: z.string().min(1),
    pinHash: z.string().min(1),
    pepperVersion: z.string().min(1),
  })
  .passthrough();
const storedUser = (value: unknown): StoredUser => storedUserSchema.parse(value) as StoredUser;
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
  const data = result.Item?.data;
  if (!data) return undefined;
  const pointer = usernameLookupSchema.safeParse(data);
  if (pointer.success) return userById(pointer.data.userId);
  // Compatibility read only; the migration replaces legacy duplicated user rows with pointers.
  return storedUser(data);
}
export async function userById(id: string): Promise<StoredUser | undefined> {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.user(id), ConsistentRead: true }),
  );
  return result.Item?.data ? storedUser(result.Item.data) : undefined;
}

export async function activeUsersForCrisisPlan(): Promise<
  Array<Pick<StoredUser, 'id' | 'displayName' | 'username' | 'active'>>
> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :partition',
      ExpressionAttributeValues: { ':partition': 'ADMIN#USER' },
      ProjectionExpression: '#data.id, #data.displayName, #data.username, #data.active',
      ExpressionAttributeNames: { '#data': 'data' },
    }),
  );
  return (result.Items ?? [])
    .map((item) => item.data as Pick<StoredUser, 'id' | 'displayName' | 'username' | 'active'>)
    .filter((user) => user.active === true);
}
export async function userByProvisionToken(token: string): Promise<StoredUser | undefined> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.provisionRequest(token),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data ? storedUser(result.Item.data) : undefined;
}
export async function putUser(user: StoredUser, idempotencyToken?: string): Promise<void> {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.username(user.username),
              data: { userId: user.id, canonicalUsername: canonicalUsername(user.username) },
            },
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
              brokerActive: user.active,
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

/** Copies only the current active flag into the broker-readable top-level projection. */
export async function syncBrokerActiveProjection(userId: string) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.user(userId),
      UpdateExpression: 'SET brokerActive = #data.#active',
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(#data.#active)',
      ExpressionAttributeNames: { '#data': 'data', '#active': 'active' },
    }),
  );
}

export async function putUsernameLookup(user: Pick<StoredUser, 'id' | 'username'>) {
  const username = canonicalUsername(user.username);
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.username(username), data: { userId: user.id, canonicalUsername: username } },
    }),
  );
}

export async function changeUserSecurity(
  userId: string,
  change: {
    tfaStatus: StoredUser['tfaStatus'];
    tfaEnrolledAt?: string;
    nextSessionEpoch: number;
  },
) {
  const now = new Date().toISOString();
  const setExpression =
    'SET #data.tfaStatus=:status, #data.sessionEpoch=:epoch, #data.securityUpdatedAt=:now, #data.#version=if_not_exists(#data.#version, :zero)+:one' +
    (change.tfaEnrolledAt ? ', #data.tfaEnrolledAt=:enrolledAt' : '');
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.user(userId),
      UpdateExpression: `${setExpression}${change.tfaEnrolledAt ? '' : ' REMOVE #data.tfaEnrolledAt'}`,
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: {
        ':status': change.tfaStatus,
        ':epoch': change.nextSessionEpoch,
        ':now': now,
        ':zero': 0,
        ':one': 1,
        ...(change.tfaEnrolledAt ? { ':enrolledAt': change.tfaEnrolledAt } : {}),
      },
    }),
  );
}

export async function commitPasswordReset(change: {
  userId: string;
  passwordHash: string;
  expectedVersion: number;
  nextCredentialVersion: number;
  nextSessionEpoch: number;
  retainedTfaStatus: StoredUser['tfaStatus'];
}) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.user(change.userId),
      UpdateExpression:
        'SET #data.passwordHash=:passwordHash, #data.credentialVersion=:credentialVersion, #data.sessionEpoch=:sessionEpoch, #data.tfaStatus=:tfaStatus, #data.securityUpdatedAt=:now, #data.#version=:nextVersion',
      ConditionExpression: '#data.#version=:expectedVersion',
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: {
        ':passwordHash': change.passwordHash,
        ':credentialVersion': change.nextCredentialVersion,
        ':sessionEpoch': change.nextSessionEpoch,
        ':tfaStatus': change.retainedTfaStatus,
        ':now': new Date().toISOString(),
        ':nextVersion': change.expectedVersion + 1,
        ':expectedVersion': change.expectedVersion,
      },
    }),
  );
}
