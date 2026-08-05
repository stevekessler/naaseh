import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  createTask,
  createUlid,
  taskSchema,
  transitionTask,
  setTaskLocked,
  type Task,
  type TaskInput,
} from '@naaseh/domain';
import { randomUUID } from 'node:crypto';
import { listOwnerTasks, listPublicTasks } from '../shared/store.js';
import { findTask, listRevisions, saveTaskMutation } from './task-repository.js';
import { canReadTaskAs } from '@naaseh/domain';
import { errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { sanitizeTaskPatch } from './task-service.js';
import { syncTaskReminder } from '../notifications/web-push.js';
import { recordTaskAdminRead } from './telemetry.js';
import { resolveProjectAssignment } from '../projects/project-service.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';

async function handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const correlationId = event.requestContext.requestId || randomUUID();
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: {
      lambda?: {
        userId?: string;
        csrfToken?: string;
        role?: 'admin' | 'user';
        groupIds?: string;
      };
    };
  };
  const actorId = context.authorizer?.lambda?.userId;
  if (!actorId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  const canRead = (task: Task) =>
    canReadTaskAs(task, {
      id: actorId,
      role: context.authorizer?.lambda?.role ?? 'user',
      active: true,
      groupIds: context.authorizer?.lambda?.groupIds?.split(',').filter(Boolean) ?? [],
    }).allowed;
  const auditRead = (task: Task) => {
    if (
      canReadTaskAs(task, {
        id: actorId,
        role: context.authorizer?.lambda?.role ?? 'user',
        active: true,
        groupIds: context.authorizer?.lambda?.groupIds?.split(',').filter(Boolean) ?? [],
      }).privileged
    )
      recordTaskAdminRead(correlationId, actorId, task.id);
  };
  const taskId = event.pathParameters?.taskId;
  if (
    taskId &&
    event.rawPath.endsWith('/revisions') &&
    event.requestContext.http.method === 'GET'
  ) {
    const task = await findTask(taskId);
    return task && canRead(task)
      ? json(200, { items: await listRevisions(taskId) })
      : problem(404, 'not_found', 'Task not found.', correlationId);
  }
  if (taskId && event.requestContext.http.method === 'GET') {
    const task = await findTask(taskId);
    if (task && canRead(task)) auditRead(task);
    return task && canRead(task)
      ? json(200, task)
      : problem(404, 'not_found', 'Task not found.', correlationId);
  }
  if (!taskId && event.requestContext.http.method === 'GET') {
    const [shared, owned] = await Promise.all([listPublicTasks(), listOwnerTasks(actorId)]);
    return json(200, [...shared, ...owned]);
  }
  if (event.requestContext.http.method === 'POST') {
    requireMutationSecurity(
      event.headers.origin,
      context.authorizer?.lambda?.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    let input: TaskInput;
    try {
      input = JSON.parse(event.body ?? '{}') as TaskInput;
    } catch (error) {
      return errorResponse(error, {
        correlationId,
        operation: 'tasks.create.validate',
        actorId,
      });
    }
    const task = createTask(input, actorId);
    const mutationId = event.headers['x-client-mutation-id'] ?? createUlid();
    const saved = await saveTaskMutation(
      task,
      actorId,
      mutationId,
      'create',
      [...new Set([...Object.keys(input as object), 'urgency'])],
      undefined,
      undefined,
      event.headers['x-client-id'],
    );
    if (!saved.replayed) notifyStackMembershipWorkChange('task', undefined, saved.task, 'create');
    await syncTaskReminder(saved.task);
    return json(saved.replayed ? 200 : 201, saved.task);
  }
  if (
    taskId &&
    (event.requestContext.http.method === 'PATCH' || event.rawPath.endsWith('/completion'))
  ) {
    requireMutationSecurity(
      event.headers.origin,
      context.authorizer?.lambda?.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const current = await findTask(taskId);
    if (!current || !canRead(current))
      return problem(404, 'not_found', 'Task not found.', correlationId);
    if (current.ownerId !== actorId)
      return errorResponse(
        new SafeApiError(403, 'forbidden', 'Only the owner may change this task.', 'authorization'),
        { correlationId, operation: 'tasks.update.authorize', actorId, resourceId: taskId },
      );
    const expected = Number(event.headers['if-match']);
    if (event.rawPath.endsWith('/project') && !expected)
      return errorResponse(
        new SafeApiError(428, 'precondition_required', 'If-Match is required.', 'validation'),
        { correlationId, operation: 'tasks.project.version', actorId, resourceId: taskId },
      );
    if (expected && expected !== current.version)
      return errorResponse(
        new SafeApiError(409, 'conflict', 'The task changed on another device.', 'conflict'),
        { correlationId, operation: 'tasks.update.version', actorId, resourceId: taskId },
      );
    let normalized: Partial<Task>;
    try {
      const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
      if (Object.hasOwn(body, 'projectId')) {
        if (body.projectId !== null && typeof body.projectId !== 'string')
          throw new Error('Project assignment is invalid.');
        const assignment = await resolveProjectAssignment(body.projectId as string | null);
        body.projectId = assignment.projectId;
        body.categoryId = assignment.categoryId;
      }
      normalized = event.rawPath.endsWith('/completion')
        ? { status: body.completed ? 'completed' : 'open' }
        : event.rawPath.endsWith('/lock')
          ? { visibility: body.locked ? 'private' : 'public' }
          : sanitizeTaskPatch(body);
    } catch (error) {
      return errorResponse(
        error instanceof SyntaxError
          ? error
          : new SafeApiError(400, 'invalid_request', 'The request is invalid.', 'validation'),
        {
          correlationId,
          operation: 'tasks.update.validate',
          actorId,
          resourceId: taskId,
        },
      );
    }
    const now = new Date();
    const transitioned = event.rawPath.endsWith('/lock')
      ? setTaskLocked(current, normalized.visibility === 'private', actorId, now)
      : normalized.status && normalized.status !== current.status
        ? transitionTask(current, normalized.status, actorId, now)
        : { ...current, version: current.version + 1, updatedAt: now.toISOString() };
    let next: Task;
    try {
      next = taskSchema.parse({ ...transitioned, ...normalized });
    } catch (error) {
      return errorResponse(error, {
        correlationId,
        operation: 'tasks.update.validate',
        actorId,
        resourceId: taskId,
      });
    }
    const mutationId = event.headers['x-client-mutation-id'] ?? createUlid();
    const saved = await saveTaskMutation(
      next,
      actorId,
      mutationId,
      normalized.status === 'completed'
        ? 'complete'
        : normalized.status === 'open'
          ? 'reopen'
          : normalized.visibility !== undefined && normalized.visibility !== current.visibility
            ? 'privacy'
            : 'update',
      Object.keys(normalized),
      current,
      undefined,
      event.headers['x-client-id'],
    );
    if (!saved.replayed) notifyStackMembershipWorkChange('task', current, saved.task);
    await syncTaskReminder(saved.task);
    return json(200, saved.task);
  }
  return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    const auth = (
      event.requestContext as typeof event.requestContext & {
        authorizer?: { lambda?: { userId?: string } };
      }
    ).authorizer?.lambda;
    return errorResponse(error, {
      correlationId: event.requestContext.requestId || randomUUID(),
      operation: 'tasks.request',
      actorId: auth?.userId,
      resourceId: event.pathParameters?.taskId,
    });
  }
};
