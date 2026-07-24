import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createUlid } from '@naaseh/domain';
import { errorResponse, json, problem } from '../shared/http.js';
import { findCopyJob } from './list-copy-repository.js';
import { copyList } from './list-copy-service.js';
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = (event.requestContext as any).authorizer?.lambda,
    correlationId = event.requestContext.requestId;
  if (!auth?.userId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    const actor = {
      id: auth.userId as string,
      role: (auth.role ?? 'user') as 'admin' | 'user',
      active: true,
      groupIds: String(auth.groupIds ?? '')
        .split(',')
        .filter(Boolean),
    };
    const copyId = event.pathParameters?.copyId;
    if (event.requestContext.http.method === 'GET' && copyId) {
      const job = await findCopyJob(copyId);
      return job?.requestedBy === actor.id
        ? json(200, job)
        : problem(404, 'not_found', 'Copy not found.', correlationId);
    }
    const listId = event.pathParameters?.listId;
    if (event.requestContext.http.method === 'POST' && listId)
      return json(
        202,
        await copyList(listId, event.headers['x-client-mutation-id'] ?? createUlid(), actor),
      );
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'lists.copy',
      actorId: auth.userId,
      resourceId: event.pathParameters?.listId,
    });
  }
};
