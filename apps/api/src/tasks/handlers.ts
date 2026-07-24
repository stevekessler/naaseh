export { handler as tasksHandler } from './handler.js';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { canReadTask } from '@naaseh/domain';
import { findTask } from './task-repository.js';
import { json, problem } from '../shared/http.js';
export const getTaskHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const actorId = (event.requestContext as any).authorizer?.lambda?.userId as string | undefined;
  const task = event.pathParameters?.taskId
    ? await findTask(event.pathParameters.taskId)
    : undefined;
  return actorId && task && canReadTask(task, actorId)
    ? json(200, task)
    : problem(404, 'not_found', 'Task not found.', event.requestContext.requestId);
};
