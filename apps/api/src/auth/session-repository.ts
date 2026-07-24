import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SessionRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
export const saveSession = async (tokenHash: string, session: SessionRecord) =>
  dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys.session(tokenHash),
        data: session,
        expiresAt: Math.floor(new Date(session.absoluteExpiresAt).getTime() / 1000),
      },
    }),
  );
export const findSession = async (tokenHash: string) =>
  (
    await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: keys.session(tokenHash), ConsistentRead: true }),
    )
  ).Item?.data as SessionRecord | undefined;
export const deleteSession = async (tokenHash: string) =>
  dynamodb.send(new DeleteCommand({ TableName: tableName, Key: keys.session(tokenHash) }));
export const refreshIdleExpiry = async (tokenHash: string, idleExpiresAt: string) =>
  dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.session(tokenHash),
      UpdateExpression: 'SET #data.idleExpiresAt=:idle',
      ConditionExpression: 'attribute_exists(PK) AND #data.absoluteExpiresAt > :now',
      ExpressionAttributeNames: { '#data': 'data' },
      ExpressionAttributeValues: { ':idle': idleExpiresAt, ':now': new Date().toISOString() },
    }),
  );
