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
import { findTask } from '../tasks/task-repository.js';
import { APNSProvider, apnsPayload } from './apns.js';
import {
  nativeInstallationKey,
  nativeInstallationSchema,
  type StoredNativeInstallation,
} from './native-installation.js';

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
    const input: unknown = JSON.parse(event.body ?? '{}');
    if (input && typeof input === 'object' && 'kind' in input && input.kind === 'apple') {
      const body = nativeInstallationSchema.parse(input);
      const installation: StoredNativeInstallation = {
        ...body,
        userId,
        updatedAt: new Date().toISOString(),
      };
      await dynamodb.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...nativeInstallationKey(userId, body.clientId), data: installation },
        }),
      );
      return json(204, undefined);
    }
    const body = subscriptionSchema.parse(input);
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
    const kind = event.queryStringParameters?.kind;
    const key =
      kind === 'apple'
        ? nativeInstallationKey(userId, clientId)
        : subscriptionKey(userId, clientId);
    await dynamodb.send(new DeleteCommand({ TableName: tableName, Key: key }));
    return json(204, undefined);
  }
  return problem(405, 'method_not_allowed', 'Method not allowed.', event.requestContext.requestId);
}

async function scheduled(event: { taskId: string; userId: string; occurrenceId?: string }) {
  const task = await findTask(event.taskId);
  if (!task || task.ownerId !== event.userId || task.status !== 'open') return;
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
  const credentials = JSON.parse(secret.SecretString ?? '{}') as {
    subject?: string;
    publicKey?: string;
    privateKey?: string;
    apns?: {
      teamId?: string;
      keyId?: string;
      privateKey?: string;
      topics?: { ios?: string; macos?: string };
    };
  };
  for (const item of result.Items ?? []) {
    if (String(item.SK ?? '').startsWith('APPLE#')) {
      const installation = item.data as StoredNativeInstallation;
      const topic = installation.topic;
      const apns = credentials.apns;
      if (!apns?.teamId || !apns.keyId || !apns.privateKey) {
        metric('APNSDeliveryFailures', 1, 'Count', { failureClass: 'configuration' });
        continue;
      }
      const provider = new APNSProvider({
        teamId: apns.teamId,
        keyId: apns.keyId,
        privateKey: apns.privateKey,
        topic,
        environment: installation.environment,
      });
      const outcome = await provider.send(
        installation,
        apnsPayload({
          occurrenceId: event.occurrenceId ?? `${event.userId}:${event.taskId}`,
          taskId: event.taskId,
          previewPolicy: installation.previewPolicy,
          ...(installation.previewPolicy === 'private' ? { title: task.label } : {}),
        }),
      );
      metric(outcome === 'success' ? 'APNSDeliveries' : 'APNSDeliveryFailures', 1, 'Count', {
        outcome,
      });
      if (outcome === 'invalid-token')
        await dynamodb.send(
          new DeleteCommand({
            TableName: tableName,
            Key: nativeInstallationKey(installation.userId, installation.clientId),
          }),
        );
      continue;
    }
    const subscription = item.data as StoredPushSubscription;
    if (!credentials.subject || !credentials.publicKey || !credentials.privateKey) {
      metric('WebPushDeliveryFailures', 1, 'Count', { failureClass: 'configuration' });
      continue;
    }
    try {
      await deliverGenericReminder({
        taskId: event.taskId,
        subscription,
        vapidSubject: credentials.subject,
        vapidPublicKey: credentials.publicKey,
        vapidPrivateKey: credentials.privateKey,
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
    .object({
      type: z.literal('task-reminder'),
      taskId: z.string(),
      userId: z.string(),
      occurrenceId: z.string().optional(),
    })
    .parse(event);
  await scheduled({
    taskId: scheduledEvent.taskId,
    userId: scheduledEvent.userId,
    ...(scheduledEvent.occurrenceId ? { occurrenceId: scheduledEvent.occurrenceId } : {}),
  });
};
