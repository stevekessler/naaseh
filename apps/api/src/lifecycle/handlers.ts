import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createUlid, parseUrgencySet } from '@naaseh/domain';
import { errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { listAuthorizedArchive } from './archive-service.js';
import { changeListLifecycle } from './list-lifecycle-service.js';
import { changeTaskLifecycle } from './task-lifecycle-service.js';
import {
  createPaginationCursorCodec,
  dynamoPersistedCursorRepository,
} from '../shared/persistent-pagination-cursor.js';

const lifecycleCursorCodec = createPaginationCursorCodec(
  process.env.CURSOR_SIGNING_SECRET ?? 'local-lifecycle-cursor-secret',
  dynamoPersistedCursorRepository,
);

export function validateLifecyclePreconditions(headers: Record<string, string | undefined>) {
  const rawVersion = headers['if-match'];
  if (!rawVersion || !/^\d+$/.test(rawVersion))
    throw new SafeApiError(428, 'precondition_required', 'If-Match is required.', 'validation');
  const mutationId = headers['idempotency-key'] ?? headers['x-client-mutation-id'];
  if (!mutationId)
    throw new SafeApiError(
      400,
      'idempotency_key_required',
      'Idempotency-Key is required.',
      'validation',
    );
  return { expectedVersion: Number(rawVersion), mutationId };
}

const actorFor = (event: Parameters<APIGatewayProxyHandlerV2>[0]) => {
  const claims = (event.requestContext as any).authorizer?.lambda as
    | {
        userId?: string;
        role?: 'admin' | 'user';
        csrfToken?: string;
        groupIds?: string;
        accessEpoch?: number;
      }
    | undefined;
  return {
    actor: {
      id: claims?.userId ?? '',
      role: claims?.role ?? ('user' as const),
      active: true,
      groupIds: claims?.groupIds?.split(',').filter(Boolean) ?? [],
    },
    csrfToken: claims?.csrfToken ?? '',
    accessEpoch: claims?.accessEpoch ?? 0,
  };
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  const { actor, csrfToken, accessEpoch } = actorFor(event);
  if (!actor.id) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    if (event.requestContext.http.method === 'GET' && /\/archive\/?$/.test(event.rawPath)) {
      return json(
        200,
        await listAuthorizedArchive(actor, {
          ...(event.queryStringParameters?.query
            ? { query: event.queryStringParameters.query }
            : {}),
          ...(event.queryStringParameters?.categoryId
            ? { categoryId: event.queryStringParameters.categoryId }
            : {}),
          ...(event.queryStringParameters?.projectId
            ? { projectId: event.queryStringParameters.projectId }
            : {}),
          ...(event.queryStringParameters?.urgencies
            ? { urgencies: parseUrgencySet(event.queryStringParameters.urgencies) }
            : {}),
          ...(event.queryStringParameters?.cursor
            ? { cursor: event.queryStringParameters.cursor }
            : {}),
          ...(event.queryStringParameters?.limit
            ? { limit: Number(event.queryStringParameters.limit) }
            : {}),
          accessEpoch,
          cursorCodec: lifecycleCursorCodec,
        }),
      );
    }
    requireMutationSecurity(event.headers.origin, csrfToken, event.headers['x-csrf-token']);
    const { expectedVersion, mutationId } = validateLifecyclePreconditions(event.headers);
    const taskId = event.pathParameters?.taskId;
    const listId = event.pathParameters?.listId;
    if (taskId) {
      const action = event.rawPath.endsWith('/complete')
        ? 'complete'
        : event.rawPath.endsWith('/archive')
          ? 'archive'
          : event.rawPath.endsWith('/restore')
            ? 'restore'
            : undefined;
      if (!action) return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
      return json(
        200,
        await changeTaskLifecycle({
          taskId,
          actorId: actor.id,
          mutationId,
          expectedVersion,
          action,
        }),
      );
    }
    if (listId) {
      const action = event.rawPath.endsWith('/finish')
        ? 'finish'
        : event.rawPath.endsWith('/archive')
          ? 'archive'
          : event.rawPath.endsWith('/restore')
            ? 'restore'
            : undefined;
      if (!action) return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
      return json(
        200,
        await changeListLifecycle({
          listId,
          actorId: actor.id,
          mutationId,
          expectedVersion,
          action,
        }),
      );
    }
    return problem(404, 'not_found', 'Resource not found.', correlationId);
  } catch (error) {
    const safe =
      error instanceof Error && /not found/i.test(error.message)
        ? new SafeApiError(404, 'not_found', 'Resource not found.', 'not_found')
        : error instanceof Error && /version changed/i.test(error.message)
          ? new SafeApiError(409, 'conflict', 'The resource changed.', 'conflict')
          : error;
    return errorResponse(safe, {
      correlationId,
      operation: 'lifecycle.request',
      actorId: actor.id,
      resourceId: event.pathParameters?.taskId ?? event.pathParameters?.listId,
    });
  }
};

export const newLifecycleMutationId = () => createUlid();
