import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Handler } from 'aws-lambda';
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import {
  deliverGenericReminder,
  subscriptionExpired,
  type StoredPushSubscription,
} from './web-push.js';
import { metric } from '@naaseh/observability';

const secrets = new SecretsManagerClient({});
const subscriptionSchema = z
  .object({
    clientId: z.string().min(1).max(200),
    endpoint: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:'),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(20).max(1024), auth: z.string().min(8).max(256) }),
    capabilities: z.record(z.unknown()).optional(),
  })
  .strict();

const subscriptionKey = (userId: string, clientId: string) => ({
  PK: `PUSH#USER#${userId}`,
  SK: `CLIENT#${clientId}`,
});

function auth(event: APIGatewayProxyEventV2) {
  return (
    event.requestContext as typeof event.requestContext & {
      authorizer?: { lambda?: { userId?: string; csrfToken?: string } };
    }
  ).authorizer?.lambda;
}

async function api(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const claims = auth(event);
  const userId = claims?.userId;
  if (!userId)
    return problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
  requireMutationSecurity(
    event.headers.origin,
    claims?.csrfToken ?? '',
    event.headers['x-csrf-token'],
  );
  if (event.requestContext.http.method === 'POST') {
    const body = subscriptionSchema.parse(JSON.parse(event.body ?? '{}'));
    const subscription: StoredPushSubscription = {
      userId,
      clientId: body.clientId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      ...(body.expirationTime ? { expiresAt: new Date(body.expirationTime).toISOString() } : {}),
    };
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...subscriptionKey(userId, body.clientId),
          data: subscription,
          ...(body.expirationTime ? { expiresAt: Math.floor(body.expirationTime / 1000) } : {}),
        },
      }),
    );
    return json(204, undefined);
  }
  if (event.requestContext.http.method === 'DELETE') {
    const clientId = event.queryStringParameters?.clientId;
    if (!clientId)
      return problem(
        400,
        'invalid_request',
        'Client ID is required.',
        event.requestContext.requestId,
      );
    await dynamodb.send(
      new DeleteCommand({ TableName: tableName, Key: subscriptionKey(userId, clientId) }),
    );
    return json(204, undefined);
  }
  return problem(405, 'method_not_allowed', 'Method not allowed.', event.requestContext.requestId);
}

async function scheduled(event: { taskId: string; userId: string }) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `PUSH#USER#${event.userId}` },
    }),
  );
  const secret = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.WEB_PUSH_SECRET_ID }),
  );
  const vapid = JSON.parse(secret.SecretString ?? '{}') as {
    subject?: string;
    publicKey?: string;
    privateKey?: string;
  };
  if (!vapid.subject || !vapid.publicKey || !vapid.privateKey)
    throw new Error('Web Push credentials are unavailable.');
  for (const item of result.Items ?? []) {
    const subscription = item.data as StoredPushSubscription;
    try {
      await deliverGenericReminder({
        taskId: event.taskId,
        subscription,
        vapidSubject: vapid.subject,
        vapidPublicKey: vapid.publicKey,
        vapidPrivateKey: vapid.privateKey,
      });
      metric('WebPushDeliveries', 1);
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
      metric('WebPushDeliveryFailures', 1, 'Count', {
        failureClass: subscriptionExpired(status) ? 'expired-subscription' : 'delivery-failure',
      });
      if (subscriptionExpired(status))
        await dynamodb.send(
          new DeleteCommand({
            TableName: tableName,
            Key: subscriptionKey(subscription.userId, subscription.clientId),
          }),
        );
      else throw error;
    }
  }
}

export const handler: Handler = async (event: unknown) => {
  if (event && typeof event === 'object' && 'requestContext' in event) {
    const request = event as APIGatewayProxyEventV2;
    try {
      return await api(request);
    } catch (error) {
      return errorResponse(error, {
        correlationId: request.requestContext.requestId,
        operation: 'push-subscription.request',
        actorId: auth(request)?.userId,
      });
    }
  }
  const scheduledEvent = z
    .object({ type: z.literal('task-reminder'), taskId: z.string(), userId: z.string() })
    .parse(event);
  await scheduled(scheduledEvent);
};
