import {
  googleConnectionSchema,
  googleSyncConflictSchema,
  googleSyncOperationSchema,
  googleSyncRunSchema,
  googleTaskLinkSchema,
  googleTaskSharingConsentSchema,
  type GoogleConnection,
  type GoogleSyncConflict,
  type GoogleSyncOperation,
  type GoogleSyncRun,
  type GoogleTaskLink,
  type GoogleTaskSharingConsent,
} from '@naaseh/domain';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface GoogleOAuthStateRecord {
  userId: string;
  sessionHash: string;
  redirectUri: string;
  codeVerifier: string;
  issuedAt: string;
  expiresAt: number;
}

const stored = <T>(item: Record<string, unknown> | undefined) => item?.data as T | undefined;

export async function findGoogleConnection(userId: string) {
  const key = keys.googleConnection(userId);
  const result = await dynamodb.send(new GetCommand({ TableName: tableName, Key: key }));
  const value = stored<GoogleConnection>(result.Item);
  return value ? googleConnectionSchema.parse(value) : undefined;
}

export async function findGoogleConnectionById(connectionId: string) {
  const key = keys.googleConnectionById(connectionId);
  const result = await dynamodb.send(new GetCommand({ TableName: tableName, Key: key }));
  const pointer = stored<{ userId: string }>(result.Item);
  return pointer ? findGoogleConnection(pointer.userId) : undefined;
}

export async function saveGoogleConnection(value: GoogleConnection, expectedVersion?: number) {
  const connection = googleConnectionSchema.parse(value);
  const ownerKey = keys.googleConnection(connection.userId);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...ownerKey,
              data: connection,
              GSI1PK: 'GOOGLE#CONNECTIONS',
              GSI1SK: `${connection.state}#${connection.updatedAt}#${connection.id}`,
            },
            ...(expectedVersion
              ? {
                  ConditionExpression: '#data.#version=:expected',
                  ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
                  ExpressionAttributeValues: { ':expected': expectedVersion },
                }
              : { ConditionExpression: 'attribute_not_exists(PK)' }),
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleConnectionById(connection.id),
              data: { userId: connection.userId },
            },
          },
        },
      ],
    }),
  );
  return connection;
}

export async function listRunnableGoogleConnections(limit = 25) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk AND begins_with(GSI1SK,:active)',
      ExpressionAttributeValues: { ':pk': 'GOOGLE#CONNECTIONS', ':active': 'active#' },
      Limit: Math.min(100, Math.max(1, limit)),
    }),
  );
  return (result.Items ?? []).map((item) => googleConnectionSchema.parse(item.data));
}

export async function putGoogleOAuthState(stateHash: string, value: GoogleOAuthStateRecord) {
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.googleOAuthState(stateHash), data: value, expiresAt: value.expiresAt },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

export async function consumeGoogleOAuthState(stateHash: string, nowEpochSeconds: number) {
  const key = keys.googleOAuthState(stateHash);
  const result = await dynamodb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: key,
      ConditionExpression: 'attribute_exists(PK) AND expiresAt>=:now',
      ExpressionAttributeValues: { ':now': nowEpochSeconds },
      ReturnValues: 'ALL_OLD',
    }),
  );
  return stored<GoogleOAuthStateRecord>(result.Attributes);
}

export async function findGoogleTaskLink(taskId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.googleTaskLink(taskId) }),
  );
  const value = stored<GoogleTaskLink>(result.Item);
  return value ? googleTaskLinkSchema.parse(value) : undefined;
}

export async function findGoogleTaskLinkByRemote(connectionId: string, googleTaskId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.googleTaskReverseLink(connectionId, googleTaskId),
    }),
  );
  const pointer = stored<{ taskId: string }>(result.Item);
  return pointer ? findGoogleTaskLink(pointer.taskId) : undefined;
}

export async function saveGoogleTaskLink(value: GoogleTaskLink, expectedVersion?: number) {
  const link = googleTaskLinkSchema.parse(value);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleTaskLink(link.naasehTaskId),
              data: link,
              GSI1PK: `GOOGLELINKS#${link.connectionId}`,
              GSI1SK: `${link.state}#${link.naasehTaskId}`,
            },
            ...(expectedVersion
              ? {
                  ConditionExpression: '#data.#version=:expected',
                  ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
                  ExpressionAttributeValues: { ':expected': expectedVersion },
                }
              : { ConditionExpression: 'attribute_not_exists(PK)' }),
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleTaskReverseLink(link.connectionId, link.googleTaskId),
              data: { taskId: link.naasehTaskId },
            },
            ConditionExpression: 'attribute_not_exists(PK) OR #data.#taskId=:taskId',
            ExpressionAttributeNames: { '#data': 'data', '#taskId': 'taskId' },
            ExpressionAttributeValues: { ':taskId': link.naasehTaskId },
          },
        },
      ],
    }),
  );
  return link;
}

export async function saveGoogleOperation(value: GoogleSyncOperation) {
  const operation = googleSyncOperationSchema.parse(value);
  const key = keys.googleOperation(
    operation.connectionId,
    operation.state,
    operation.createdAt,
    operation.id,
  );
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...key,
        data: operation,
        GSI1PK: `GOOGLEOPS#${operation.connectionId}#${operation.state}`,
        GSI1SK: `${operation.nextAttemptAt ?? operation.createdAt}#${operation.id}`,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return operation;
}

export async function transitionGoogleOperation(
  current: GoogleSyncOperation,
  next: GoogleSyncOperation,
) {
  const value = googleSyncOperationSchema.parse(next);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: tableName,
            Key: keys.googleOperation(
              current.connectionId,
              current.state,
              current.createdAt,
              current.id,
            ),
            ConditionExpression: 'attribute_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleOperation(value.connectionId, value.state, value.createdAt, value.id),
              data: value,
              GSI1PK: `GOOGLEOPS#${value.connectionId}#${value.state}`,
              GSI1SK: `${value.nextAttemptAt ?? value.createdAt}#${value.id}`,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    }),
  );
  return value;
}

export async function listGoogleTaskLinks(connectionId: string) {
  const links: GoogleTaskLink[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK=:pk',
        ExpressionAttributeValues: { ':pk': `GOOGLELINKS#${connectionId}` },
        Limit: 100,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    links.push(...(result.Items ?? []).map((item) => googleTaskLinkSchema.parse(item.data)));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return links;
}

export async function listGoogleOperations(
  connectionId: string,
  state: GoogleSyncOperation['state'],
) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': `GOOGLEOPS#${connectionId}#${state}` },
      Limit: 100,
    }),
  );
  return (result.Items ?? []).map((item) => googleSyncOperationSchema.parse(item.data));
}

export async function saveGoogleConflict(value: GoogleSyncConflict) {
  const conflict = googleSyncConflictSchema.parse(value);
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys.googleConflict(conflict.connectionId, conflict.id),
        data: conflict,
        GSI1PK: `GOOGLECONFLICTS#${conflict.userId}#${conflict.state}`,
        GSI1SK: `${conflict.createdAt}#${conflict.id}`,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return conflict;
}

export async function listGoogleConflicts(
  userId: string,
  state: GoogleSyncConflict['state'] = 'open',
) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': `GOOGLECONFLICTS#${userId}#${state}` },
      Limit: 100,
    }),
  );
  return (result.Items ?? []).map((item) => googleSyncConflictSchema.parse(item.data));
}

export async function findGoogleConflict(connectionId: string, conflictId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.googleConflict(connectionId, conflictId) }),
  );
  const value = stored<GoogleSyncConflict>(result.Item);
  return value ? googleSyncConflictSchema.parse(value) : undefined;
}

export async function updateGoogleConflict(value: GoogleSyncConflict, expectedVersion: number) {
  const conflict = googleSyncConflictSchema.parse(value);
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys.googleConflict(conflict.connectionId, conflict.id),
        data: conflict,
        GSI1PK: `GOOGLECONFLICTS#${conflict.userId}#${conflict.state}`,
        GSI1SK: `${conflict.createdAt}#${conflict.id}`,
      },
      ConditionExpression: '#data.#version=:expected',
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: { ':expected': expectedVersion },
    }),
  );
  return conflict;
}

export async function saveGoogleRun(value: GoogleSyncRun) {
  const run = googleSyncRunSchema.parse(value);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleRun(run.connectionId, run.startedAt, run.id),
              data: run,
              expiresAt: run.expiresAt,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.googleRunById(run.id),
              data: { connectionId: run.connectionId, startedAt: run.startedAt },
              expiresAt: run.expiresAt,
            },
          },
        },
      ],
    }),
  );
  return run;
}

export async function findGoogleRun(runId: string) {
  const pointerResult = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.googleRunById(runId) }),
  );
  const pointer = stored<{ connectionId: string; startedAt: string }>(pointerResult.Item);
  if (!pointer) return undefined;
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.googleRun(pointer.connectionId, pointer.startedAt, runId),
    }),
  );
  const value = stored<GoogleSyncRun>(result.Item);
  return value ? googleSyncRunSchema.parse(value) : undefined;
}

export async function acquireGoogleRunLease(
  userId: string,
  leaseOwner: string,
  leaseExpiresAt: string,
  now: string,
) {
  const result = await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.googleConnection(userId),
      UpdateExpression:
        'SET #data.#leaseOwner=:owner,#data.#leaseExpiresAt=:expires,#data.#lastAttemptAt=:now',
      ConditionExpression:
        '#data.#state=:active AND (attribute_not_exists(#data.#leaseExpiresAt) OR #data.#leaseExpiresAt<:now)',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#leaseOwner': 'leaseOwner',
        '#leaseExpiresAt': 'leaseExpiresAt',
        '#lastAttemptAt': 'lastAttemptAt',
        '#state': 'state',
      },
      ExpressionAttributeValues: {
        ':owner': leaseOwner,
        ':expires': leaseExpiresAt,
        ':now': now,
        ':active': 'active',
      },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return googleConnectionSchema.parse(stored<GoogleConnection>(result.Attributes));
}

export async function releaseGoogleRunLease(userId: string, leaseOwner: string) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.googleConnection(userId),
      UpdateExpression: 'REMOVE #data.#leaseOwner,#data.#leaseExpiresAt',
      ConditionExpression: '#data.#leaseOwner=:owner',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#leaseOwner': 'leaseOwner',
        '#leaseExpiresAt': 'leaseExpiresAt',
      },
      ExpressionAttributeValues: { ':owner': leaseOwner },
    }),
  );
}

export async function findGoogleTaskSharing(taskId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.googleTaskSharing(taskId) }),
  );
  const value = stored<GoogleTaskSharingConsent>(result.Item);
  return value ? googleTaskSharingConsentSchema.parse(value) : undefined;
}

export async function saveGoogleTaskSharing(
  value: GoogleTaskSharingConsent,
  expectedVersion: number,
) {
  const consent = googleTaskSharingConsentSchema.parse(value);
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.googleTaskSharing(consent.taskId), data: consent },
      ...(expectedVersion === 0
        ? { ConditionExpression: 'attribute_not_exists(PK)' }
        : {
            ConditionExpression: '#data.#version=:expected',
            ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
            ExpressionAttributeValues: { ':expected': expectedVersion },
          }),
    }),
  );
  return consent;
}
