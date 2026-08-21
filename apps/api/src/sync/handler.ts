import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { errorResponse, json, problem, recordError, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { getRecord, listOwnerTasks, listPublicTasks, putRecord } from '../shared/store.js';
import { findTask, saveTaskMutation } from '../tasks/task-repository.js';
import {
  directoryItemSchema,
  listItemSchema,
  archiveCategory,
  archiveProject,
  categorySchema,
  projectSchema,
  restoreCategory,
  restoreProject,
  updateProject,
  taskSchema,
  type ContentActor,
  type Mutation,
} from '@naaseh/domain';
import { pushRequestSchema, stackSyncMutationSchema } from '@naaseh/contracts';
import {
  applySharedWorkSyncPayload,
  applyTaskMutation,
  dispatchPersonalStackSyncMutation,
  dispatchTaskTimerSyncMutation,
  serializeSharedWorkChange,
} from './sync-service.js';
import { pullAudience, type SyncFeedChange } from './change-feed-repository.js';
import { keys } from '../shared/keys.js';
import { loadPublicKeyRegistry } from '../crypto-recovery/public-key-registry.js';
import { metric } from '@naaseh/observability';
import { listUserMemberships } from '../groups/group-repository.js';
import { findList, findListItem, saveList, saveListItem } from '../lists/list-repository.js';
import { findDirectoryItem, saveDirectoryItemRecord } from '../directory/directory-repository.js';
import { defaultPersonalStackService, dispatchStackCompaction } from '../ranking/runtime.js';
import {
  createCategoryRecord,
  getCategory,
  updateCategoryRecord,
} from '../categories/category-repository.js';
import {
  createProjectRecord,
  getProject,
  updateProjectRecord,
} from '../projects/project-repository.js';
import { canReadTaskAs } from '@naaseh/domain';
import { createTaskTimerService } from '../timers/task-timer-service.js';
import {
  commitTaskTimer,
  getTaskTimer,
  getTaskTimerFeedSequence,
  getTaskTimerReceipt,
} from '../timers/task-timer-repository.js';
import { recordTaskTimerEvent } from '../timers/telemetry.js';
const MAX_BODY_BYTES = 1_000_000;

async function saveOrganizationMutationReceipt(
  actorId: string,
  mutationId: string,
  entity: { id: string; version: number },
) {
  await putRecord(
    {
      ...keys.mutation(actorId, mutationId),
      data: {
        mutationId,
        status: 'applied',
        entityVersion: entity.version,
        entity,
      },
      expiresAt: Math.floor(Date.now() / 1000) + 2_592_000,
    },
    'attribute_not_exists(PK)',
  );
}
async function handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
  if (!actorId)
    return problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
  const actor: ContentActor = {
    id: actorId,
    role: context.authorizer?.lambda?.role ?? 'user',
    active: true,
    groupIds: context.authorizer?.lambda?.groupIds?.split(',').filter(Boolean) ?? [],
  };
  if (Buffer.byteLength(event.body ?? '', 'utf8') > MAX_BODY_BYTES)
    return problem(
      413,
      'request_too_large',
      'Request is too large.',
      event.requestContext.requestId,
    );
  if (event.rawPath.endsWith('/bootstrap')) {
    const [shared, owned, taskTimer] = await Promise.all([
      listPublicTasks(),
      listOwnerTasks(actorId),
      getTaskTimer(actorId),
    ]);
    const keyRegistry = await loadPublicKeyRegistry();
    return json(200, {
      tasks: [...shared, ...owned].map((task) => taskSchema.parse(task)),
      ...(taskTimer ? { taskTimer } : {}),
      keyRegistry,
      cursor: { public: 0, owner: 0 },
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body ?? '{}');
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId,
      operation: 'sync.validate',
      actorId,
    });
  }
  if (event.rawPath.endsWith('/pull')) {
    const cursor = (parsed as { cursor?: Record<string, number> }).cursor ?? {};
    const memberships = (await listUserMemberships(actorId)).filter(
      (item) => item.status === 'active',
    );
    const feeds = [
      ['public', 'PUBLIC'],
      ['owner', `OWNER#${actorId}`],
      ['access', `ACCESS#${actorId}`],
      ...memberships.map((item) => [`group:${item.groupId}`, `GROUP#${item.groupId}`]),
      ...(context.authorizer?.lambda?.role === 'admin'
        ? Array.from({ length: 16 }, (_, index) => [`admin:${index}`, `ADMIN#${index}`])
        : []),
    ] as [string, string][];
    const pulled = await Promise.all(
      feeds.map(async ([name, audience]) => {
        const after = Number(cursor[name] ?? 0);
        const changes = await pullAudience(audience, after, 200);
        return { name, after, changes };
      }),
    );
    const deduped = new Map<string, SyncFeedChange>();
    for (const { changes } of pulled)
      for (const change of changes) {
        const key = `${change.entityType ?? 'task'}:${change.entityId}`;
        const current = deduped.get(key);
        if (
          !current ||
          (change.version ?? change.sequence) >= (current.version ?? current.sequence)
        )
          deduped.set(key, change);
      }
    return json(200, {
      changes: [...deduped.values()].map((change) =>
        change.entityType === 'personalStackOperation' ? change : serializeSharedWorkChange(change),
      ),
      cursor: Object.fromEntries(
        pulled.map(({ name, after, changes }) => [name, changes.at(-1)?.sequence ?? after]),
      ),
    });
  }
  requireMutationSecurity(
    event.headers.origin,
    context.authorizer?.lambda?.csrfToken ?? '',
    event.headers['x-csrf-token'],
  );
  const body = parsed as {
    contractVersion?: number;
    mutations?: Mutation[];
    backlog?: { depth?: number; oldestAgeSeconds?: number };
  };
  if (!Array.isArray(body.mutations) || body.mutations.length > 100)
    return errorResponse(
      new SafeApiError(
        400,
        'invalid_batch',
        'A batch must contain no more than 100 mutations.',
        'validation',
      ),
      {
        correlationId: event.requestContext.requestId,
        operation: 'sync.validate',
        actorId,
      },
    );
  const includesPersonalStackOperation = body.mutations.some(
    (mutation) => (mutation as { entityType?: string }).entityType === 'personalStackOperation',
  );
  const includesTaskTimer = body.mutations.some(
    (mutation) => (mutation as { entityType?: string }).entityType === 'taskTimer',
  );
  if (includesPersonalStackOperation || includesTaskTimer) pushRequestSchema.parse(parsed);
  const results = [];
  const backlogDepth = Number(body.backlog?.depth);
  const oldestAgeSeconds = Number(body.backlog?.oldestAgeSeconds);
  if (
    Number.isInteger(backlogDepth) &&
    backlogDepth >= 1 &&
    backlogDepth <= 100_000 &&
    Number.isInteger(oldestAgeSeconds) &&
    oldestAgeSeconds >= 0 &&
    oldestAgeSeconds <= 31_536_000
  ) {
    metric('SyncBacklogDepth', backlogDepth);
    metric('SyncOldestPendingAge', oldestAgeSeconds, 'Seconds');
  }
  for (const mutation of body.mutations) {
    if (mutation.entityType === 'taskTimer') {
      const sourceClientId = event.headers['x-client-id'];
      if (!sourceClientId)
        throw new SafeApiError(
          400,
          'missing_client_id',
          'A client identifier is required for timer synchronization.',
          'validation',
        );
      const timerService = createTaskTimerService({
        repository: {
          load: getTaskTimer,
          findReceipt: getTaskTimerReceipt,
          feedSequence: getTaskTimerFeedSequence,
          commit: async (input) => {
            try {
              await commitTaskTimer(input);
            } catch (error) {
              if (error instanceof Error && error.name === 'TransactionCanceledException')
                return false;
              throw error;
            }
          },
        },
        canReadTask: async (_ownerId, taskId) => {
          const task = await findTask(taskId);
          return Boolean(task && canReadTaskAs(task, actor).allowed);
        },
      });
      const startedAt = Date.now();
      const timerResult = await dispatchTaskTimerSyncMutation({
        actorId,
        sourceClientId,
        mutation,
        service: timerService,
      });
      recordTaskTimerEvent({
        operation: String((mutation.payload as { type?: unknown })?.type ?? 'unknown'),
        outcome:
          timerResult.status === 'alreadyApplied'
            ? 'duplicate'
            : timerResult.status === 'retry'
              ? 'failed'
              : timerResult.status,
        durationMs: Date.now() - startedAt,
        correlationId: event.requestContext.requestId,
      });
      results.push(timerResult);
      continue;
    }
    if (stackSyncMutationSchema.safeParse(mutation).success) {
      const sourceClientId = event.headers['x-client-id'];
      if (!sourceClientId)
        throw new SafeApiError(
          400,
          'missing_client_id',
          'A client identifier is required for personal stack synchronization.',
          'validation',
        );
      results.push(
        await dispatchPersonalStackSyncMutation({
          actorId,
          actor,
          sourceClientId,
          mutation,
          service: defaultPersonalStackService,
          onPendingCompaction: dispatchStackCompaction,
        }),
      );
      continue;
    }
    const mutationKey = keys.mutation(actorId, mutation.id);
    const prior = await getRecord<{
      version: number;
      data?: { entityVersion: number; entity: unknown };
    }>(mutationKey.PK, mutationKey.SK);
    if (prior) {
      results.push({
        mutationId: mutation.id,
        status: 'alreadyApplied',
        entityVersion: prior.data?.entityVersion ?? prior.version,
        entity: prior.data?.entity,
      });
      continue;
    }
    if (mutation.entityType === 'category' || mutation.entityType === 'project') {
      if (actor.role !== 'admin') {
        results.push({ mutationId: mutation.id, status: 'rejected' });
        continue;
      }
      try {
        if (mutation.entityType === 'category') {
          const current = await getCategory(mutation.entityId);
          if (mutation.baseVersion !== (current?.version ?? 0)) {
            results.push({
              mutationId: mutation.id,
              status: current ? 'conflict' : 'rejected',
              entityVersion: current?.version,
              ...(current ? { current } : {}),
            });
            continue;
          }
          const next = !current
            ? categorySchema.parse(mutation.payload)
            : mutation.operation === 'archiveOrganization'
              ? archiveCategory(current, actorId)
              : mutation.operation === 'restoreOrganization'
                ? restoreCategory(current)
                : categorySchema.parse({
                    ...current,
                    ...(mutation.payload as Record<string, unknown>),
                    updatedAt: new Date().toISOString(),
                    version: current.version + 1,
                  });
          if (next.id !== mutation.entityId || (!current && next.version !== 1))
            throw new Error('Category mutation identity or version is invalid.');
          if (current) await updateCategoryRecord(current, next);
          else await createCategoryRecord(next);
          await saveOrganizationMutationReceipt(actorId, mutation.id, next);
          results.push({
            mutationId: mutation.id,
            status: 'applied',
            entityVersion: next.version,
            entity: next,
          });
        } else {
          const current = await getProject(mutation.entityId);
          if (mutation.baseVersion !== (current?.version ?? 0)) {
            results.push({
              mutationId: mutation.id,
              status: current ? 'conflict' : 'rejected',
              entityVersion: current?.version,
              ...(current ? { current } : {}),
            });
            continue;
          }
          const next = !current
            ? projectSchema.parse(mutation.payload)
            : mutation.operation === 'archiveOrganization'
              ? archiveProject(current, actorId)
              : mutation.operation === 'restoreOrganization'
                ? restoreProject(current)
                : updateProject(current, mutation.payload as Parameters<typeof updateProject>[1]);
          if (next.id !== mutation.entityId || (!current && next.version !== 1))
            throw new Error('Project mutation identity or version is invalid.');
          if (!(await getCategory(next.categoryId)))
            throw new Error('Project category is unavailable.');
          if (current) await updateProjectRecord(current, next);
          else await createProjectRecord(next);
          await saveOrganizationMutationReceipt(actorId, mutation.id, next);
          results.push({
            mutationId: mutation.id,
            status: 'applied',
            entityVersion: next.version,
            entity: next,
          });
        }
      } catch (error) {
        const classified = recordError(error, {
          correlationId: event.requestContext.requestId,
          operation: 'sync.organizationMutation',
          actorId,
          resourceId: mutation.entityId,
        });
        results.push({
          mutationId: mutation.id,
          status:
            classified.classification === 'conflict'
              ? 'conflict'
              : classified.retryable
                ? 'retry'
                : 'rejected',
          problem: {
            code: classified.code,
            message: classified.safeMessage,
            correlationId: event.requestContext.requestId,
          },
        });
      }
      continue;
    }
    if (mutation.entityType === 'list') {
      const current = await findList(mutation.entityId);
      try {
        const payload = mutation.payload as Record<string, unknown>;
        const next = applySharedWorkSyncPayload(
          'list',
          current,
          payload,
          (current?.version ?? 0) + 1,
          new Date().toISOString(),
        );
        if (next.ownerId !== actorId || mutation.baseVersion !== (current?.version ?? 0)) {
          results.push({
            mutationId: mutation.id,
            status: current ? 'conflict' : 'rejected',
            entityVersion: current?.version,
          });
          continue;
        }
        await saveList(
          next,
          actorId,
          mutation.id,
          current ? 'update' : 'create',
          Object.keys(payload),
          current?.version ?? 0,
        );
        results.push({
          mutationId: mutation.id,
          status: 'applied',
          entityVersion: next.version,
          entity: next,
        });
      } catch {
        results.push({ mutationId: mutation.id, status: 'rejected' });
      }
      continue;
    }
    if (mutation.entityType === 'listItem') {
      const current = await findListItem(mutation.entityId);
      try {
        const payload = mutation.payload as Record<string, unknown>;
        const next = listItemSchema.parse(
          current
            ? {
                ...current,
                ...payload,
                version: current.version + 1,
                updatedAt: new Date().toISOString(),
              }
            : payload,
        );
        const parent = await findList(next.listId);
        if (
          !parent ||
          parent.ownerId !== actorId ||
          mutation.baseVersion !== (current?.version ?? 0)
        ) {
          results.push({
            mutationId: mutation.id,
            status: current ? 'conflict' : 'rejected',
            entityVersion: current?.version,
          });
          continue;
        }
        await saveListItem(
          next,
          actorId,
          mutation.id,
          mutation.operation === 'complete'
            ? 'complete'
            : mutation.operation === 'reopen'
              ? 'reopen'
              : mutation.operation === 'reorder'
                ? 'reorder'
                : current
                  ? 'update'
                  : 'create',
          Object.keys(payload),
          current?.version ?? 0,
        );
        results.push({
          mutationId: mutation.id,
          status: 'applied',
          entityVersion: next.version,
          entity: next,
        });
      } catch {
        results.push({ mutationId: mutation.id, status: 'rejected' });
      }
      continue;
    }
    if (mutation.entityType === 'directoryItem') {
      const current = await findDirectoryItem(mutation.entityId);
      try {
        const payload = mutation.payload as Record<string, unknown>;
        const next = directoryItemSchema.parse(
          current
            ? {
                ...current,
                ...payload,
                updatedBy: actorId,
                version: current.version + 1,
                updatedAt: new Date().toISOString(),
              }
            : payload,
        );
        if (mutation.baseVersion !== (current?.version ?? 0)) {
          results.push({
            mutationId: mutation.id,
            status: 'conflict',
            entityVersion: current?.version,
          });
          continue;
        }
        await saveDirectoryItemRecord(next, actorId, mutation.id, current?.version ?? 0);
        results.push({
          mutationId: mutation.id,
          status: 'applied',
          entityVersion: next.version,
          entity: next,
        });
      } catch {
        results.push({ mutationId: mutation.id, status: 'rejected' });
      }
      continue;
    }
    if (mutation.entityType !== 'task') {
      results.push({ mutationId: mutation.id, status: 'rejected' });
      continue;
    }
    const current = await findTask(mutation.entityId);
    const outcome = applyTaskMutation(current, mutation);
    if (outcome.status !== 'applied') {
      results.push(outcome);
      continue;
    }
    try {
      const payload = mutation.payload as Record<string, unknown>;
      const next = applySharedWorkSyncPayload(
        'task',
        current,
        payload,
        outcome.version ?? (current?.version ?? 0) + 1,
        new Date().toISOString(),
      );
      if (next.ownerId !== actorId) {
        results.push({ mutationId: mutation.id, status: 'rejected' });
        continue;
      }
      const saved = await saveTaskMutation(
        next,
        actorId,
        mutation.id,
        current ? 'update' : 'create',
        Object.keys(payload),
        current,
        undefined,
        event.headers['x-client-id'],
      );
      results.push({
        mutationId: mutation.id,
        status: saved.replayed ? 'alreadyApplied' : 'applied',
        entityVersion: saved.task.version,
        entity: saved.task,
      });
    } catch (error) {
      const classified = recordError(error, {
        correlationId: event.requestContext.requestId,
        operation: 'sync.mutation',
        actorId,
        resourceId: mutation.entityId,
      });
      results.push({
        mutationId: mutation.id,
        status:
          classified.classification === 'conflict'
            ? 'conflict'
            : classified.retryable
              ? 'retry'
              : 'rejected',
        problem: {
          code: classified.code,
          message: classified.safeMessage,
          correlationId: event.requestContext.requestId,
        },
      });
    }
  }
  const conflicts = results.filter((result) => result.status === 'conflict').length;
  const retries = results.filter((result) => result.status === 'retry').length;
  metric('SyncMutationBatchSize', results.length);
  if (conflicts) metric('SyncConflicts', conflicts);
  if (retries) metric('SyncRetryableFailures', retries);
  return json(200, { results });
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    const actorId = (
      event.requestContext as typeof event.requestContext & {
        authorizer?: { lambda?: { userId?: string } };
      }
    ).authorizer?.lambda?.userId;
    return errorResponse(error, {
      correlationId: event.requestContext.requestId,
      operation: 'sync.request',
      actorId,
    });
  }
};
