export { handler as tasksHandler } from './handler.js';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { canReadTaskAs } from '@naaseh/domain';
import { findTask } from './task-repository.js';
import { json, problem } from '../shared/http.js';
export const getTaskHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = (event.requestContext as any).authorizer?.lambda as
    | { userId?: string; role?: 'admin' | 'user'; groupIds?: string }
    | undefined;
  const actorId = auth?.userId;
  const task = event.pathParameters?.taskId
    ? await findTask(event.pathParameters.taskId)
    : undefined;
  return actorId &&
    task &&
    canReadTaskAs(task, {
      id: actorId,
      role: auth?.role ?? 'user',
      active: true,
      groupIds: auth?.groupIds?.split(',').filter(Boolean) ?? [],
    }).allowed
    ? json(200, task)
    : problem(404, 'not_found', 'Task not found.', event.requestContext.requestId);
};
export { validateLifecyclePreconditions } from '../lifecycle/handlers.js';
