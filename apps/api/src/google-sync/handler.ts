import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  DynamoDBStreamEvent,
  EventBridgeEvent,
  Handler,
} from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { googleSyncRunSchema } from '@naaseh/domain';
import { z } from 'zod';
import {
  googleConflictResolutionSchema,
  googleDisconnectRequestSchema,
  googleSyncPreviewRequestSchema,
  googleSyncSettingsPatchSchema,
  googleTaskSharingRequestSchema,
  googleSyncRunStatusSchema,
  googleQuarantineListSchema,
} from '@naaseh/contracts';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import {
  completeGoogleAuthorization,
  googleClientForConnection,
  startGoogleAuthorization,
} from './auth-service.js';
import {
  disconnectGoogle,
  googleDisconnectPreview,
  publicGoogleStatus,
  resolveGoogleSyncConflict,
  setGoogleTaskSharing,
  updateGoogleSettings,
} from './control-service.js';
import { previewGooglePublication } from './publish-service.js';
import {
  findGoogleConnection,
  findGoogleConnectionById,
  findGoogleRun,
  listGoogleConflicts,
  listGoogleOperations,
  listRunnableGoogleConnections,
  saveGoogleRun,
} from './repository.js';
import {
  queueGoogleSynchronization,
  retryGoogleQuarantine,
  runGoogleSynchronization,
} from './run-service.js';

type Claims = { userId?: string; csrfToken?: string; sessionHash?: string };
const connectSchema = z.object({ defaultTimeZone: z.string().min(1).max(100) }).strict();
const createListSchema = z.object({ title: z.string().trim().min(1).max(1024) }).strict();

const redirect = (location: string) => ({
  statusCode: 302,
  headers: {
    location,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  },
});

const apiHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  const claims = (
    event.requestContext as typeof event.requestContext & {
      authorizer?: { lambda?: Claims };
    }
  ).authorizer?.lambda;
  if (!claims?.userId)
    return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  const actorId = claims.userId;
  const path = event.rawPath;
  const method = event.requestContext.http.method;
  try {
    if (method === 'GET' && path.endsWith('/callback')) {
      if (event.queryStringParameters?.error) return redirect('/google?connection=denied');
      const state = event.queryStringParameters?.state;
      const code = event.queryStringParameters?.code;
      if (!state || !code || !claims.sessionHash) return redirect('/google?connection=invalid');
      await completeGoogleAuthorization({
        userId: actorId,
        sessionHash: claims.sessionHash,
        state,
        code,
      });
      return redirect('/google?connection=connected');
    }

    if (method === 'GET' && path.endsWith('/status'))
      return json(200, publicGoogleStatus(await findGoogleConnection(actorId)));

    if (method === 'GET' && path.endsWith('/task-lists')) {
      const connection = await findGoogleConnection(actorId);
      if (!connection)
        return problem(404, 'not_found', 'Google connection not found.', correlationId);
      const lists = await (await googleClientForConnection(connection)).listTaskLists();
      return json(
        200,
        lists.map(({ id, title, etag }) => ({ id, title, etag })),
      );
    }

    if (method === 'GET' && path.endsWith('/conflicts'))
      return json(200, await listGoogleConflicts(actorId));

    if (method === 'GET' && path.match(/\/runs\/[^/]+$/)) {
      const run = await findGoogleRun(event.pathParameters?.runId ?? '');
      if (!run || run.userId !== actorId)
        return problem(404, 'not_found', 'Google synchronization run not found.', correlationId);
      return json(
        200,
        googleSyncRunStatusSchema.parse({
          runId: run.id,
          state: run.state,
          trigger: run.trigger,
          counts: run.counts,
          startedAt: run.startedAt,
          ...(run.completedAt ? { completedAt: run.completedAt } : {}),
        }),
      );
    }

    if (method === 'GET' && path.endsWith('/quarantine')) {
      const connection = await findGoogleConnection(actorId);
      if (!connection) return json(200, []);
      return json(
        200,
        googleQuarantineListSchema.parse(
          (await listGoogleOperations(connection.id, 'quarantined')).map((operation) => ({
            id: operation.id,
            direction: operation.direction,
            type: operation.type,
            attemptCount: operation.attemptCount,
            ...(operation.safeErrorCode ? { safeErrorCode: operation.safeErrorCode } : {}),
            ...(operation.providerStatusClass
              ? { providerStatusClass: operation.providerStatusClass }
              : {}),
            updatedAt: operation.updatedAt,
          })),
        ),
      );
    }

    if (method === 'GET' && path.endsWith('/disconnect-preview'))
      return json(200, await googleDisconnectPreview(actorId));

    requireMutationSecurity(
      event.headers.origin,
      claims.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );

    const body = () => JSON.parse(event.body ?? '{}') as unknown;
    if (method === 'POST' && path.endsWith('/connect')) {
      const input = connectSchema.parse(body());
      return json(
        200,
        await startGoogleAuthorization({
          userId: actorId,
          sessionHash: claims.sessionHash ?? '',
          defaultTimeZone: input.defaultTimeZone,
        }),
      );
    }

    if (method === 'POST' && path.endsWith('/task-lists')) {
      const input = createListSchema.parse(body());
      const connection = await findGoogleConnection(actorId);
      if (!connection)
        return problem(404, 'not_found', 'Google connection not found.', correlationId);
      const list = await (await googleClientForConnection(connection)).createTaskList(input.title);
      return json(201, { id: list.id, title: list.title, etag: list.etag });
    }

    if (method === 'POST' && path.endsWith('/preview')) {
      const input = googleSyncPreviewRequestSchema.parse(body());
      const connection = await findGoogleConnection(actorId);
      if (!connection)
        return problem(404, 'not_found', 'Google connection not found.', correlationId);
      const client = await googleClientForConnection(connection);
      return json(200, await previewGooglePublication(connection, client, input.taskListId));
    }

    if (method === 'PATCH' && path.endsWith('/settings')) {
      const input = googleSyncSettingsPatchSchema.parse(body());
      const connection = await updateGoogleSettings({
        userId: actorId,
        expectedVersion: input.expectedVersion,
        ...(input.selectedTaskListId ? { selectedTaskListId: input.selectedTaskListId } : {}),
        ...(input.selectedTaskListTitle
          ? { selectedTaskListTitle: input.selectedTaskListTitle }
          : {}),
        ...(input.defaultLocalTime ? { defaultLocalTime: input.defaultLocalTime } : {}),
        ...(input.defaultTimeZone ? { defaultTimeZone: input.defaultTimeZone } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.listChangeMode ? { listChangeMode: input.listChangeMode } : {}),
      });
      return json(200, publicGoogleStatus(connection));
    }

    if (method === 'POST' && path.endsWith('/sync')) {
      const connection = await findGoogleConnection(actorId);
      if (!connection || connection.state !== 'active')
        return problem(409, 'not_active', 'Google synchronization is not active.', correlationId);
      const run = await queueGoogleSynchronization(connection);
      return json(202, { runId: run.id });
    }

    if (method === 'POST' && path.match(/\/quarantine\/[^/]+\/retry$/)) {
      const connection = await findGoogleConnection(actorId);
      if (!connection)
        return problem(404, 'not_found', 'Google connection not found.', correlationId);
      const operation = await retryGoogleQuarantine(
        connection,
        event.pathParameters?.operationId ?? '',
      );
      if (!operation)
        return problem(404, 'not_found', 'Quarantined item not found.', correlationId);
      return json(202, { retried: true });
    }

    if (method === 'POST' && path.match(/\/conflicts\/[^/]+$/)) {
      const input = googleConflictResolutionSchema.parse(body());
      await resolveGoogleSyncConflict({
        userId: actorId,
        conflictId: event.pathParameters?.conflictId ?? '',
        source: input.source,
        ...(input.editedValue !== undefined ? { editedValue: input.editedValue } : {}),
        expectedVersion: input.expectedVersion,
      });
      return json(200, { resolved: true });
    }

    if (method === 'PUT' && path.endsWith('/google-sharing')) {
      const input = googleTaskSharingRequestSchema.parse(body());
      return json(
        200,
        await setGoogleTaskSharing({
          userId: actorId,
          taskId: event.pathParameters?.taskId ?? '',
          approved: input.approved,
          expectedVersion: input.expectedVersion,
        }),
      );
    }

    if (method === 'POST' && path.endsWith('/disconnect')) {
      const input = googleDisconnectRequestSchema.parse(body());
      const connection = await disconnectGoogle({ userId: actorId, ...input });
      return json(202, { runId: `disconnect:${connection.id}` });
    }
    return problem(404, 'not_found', 'Google synchronization route not found.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'google-sync.request',
      actorId,
    });
  }
};

export const handler: Handler<
  | APIGatewayProxyEventV2
  | EventBridgeEvent<'Scheduled Event', Record<string, never>>
  | DynamoDBStreamEvent
> = async (event) => {
  if ('Records' in event) {
    for (const record of event.Records) {
      const image = record.dynamodb?.NewImage;
      if (!image) continue;
      const item = unmarshall(image as never) as { data?: unknown };
      const queued = googleSyncRunSchema.safeParse(item.data);
      if (!queued.success || queued.data.state !== 'queued') continue;
      const connection = await findGoogleConnectionById(queued.data.connectionId);
      if (!connection || connection.state !== 'active') {
        await saveGoogleRun({
          ...queued.data,
          state: 'failed',
          completedAt: new Date().toISOString(),
        });
        continue;
      }
      await runGoogleSynchronization({
        connection,
        trigger: 'manual',
        queuedRun: queued.data,
      }).catch(() => undefined);
    }
    return;
  }
  if (!('requestContext' in event)) {
    for (const connection of await listRunnableGoogleConnections(10))
      await runGoogleSynchronization({ connection, trigger: 'scheduled' }).catch(() => undefined);
    return;
  }
  return apiHandler(event, {} as never, () => undefined);
};
