import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  reorderHeadersSchema,
  reorderRequestSchema,
  stackPageQuerySchema,
} from '@naaseh/contracts';
import {
  personalStackMoveSchema,
  personalStackScopeSchema,
  stackScopeIdentity,
  workReferenceIdentity,
  type Urgency,
  type ContentActor,
} from '@naaseh/domain';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { type PersonalStackReorderResult, type PersonalStackService } from './stack-service.js';
import { readFilteredStackPage, type FilteredStackCandidate } from './filtered-stack-reader.js';
import { PaginationCursorError } from '../shared/pagination-cursor.js';
import { defaultPersonalStackService, dispatchStackCompaction } from './runtime.js';

export function createPersonalStackHandler(input: {
  service: PersonalStackService;
  cursorSecret: string;
  onPendingCompaction?: (
    scope: Parameters<PersonalStackService['read']>[0]['scope'],
    actor: ContentActor,
  ) => Promise<void>;
  loadPaginationContext?:
    | ((value: { actorId: string; scopeIdentity: string }) => Promise<{
        accessEpoch: number;
        sourceEpochs: Record<string, number>;
        snapshotGeneration?: number | undefined;
        tailWatermark?: string | undefined;
      }>)
    | undefined;
}) {
  const operationResults = new Map<
    string,
    { ownerId: string; result: PersonalStackReorderResult }
  >();
  return async (event: APIGatewayProxyEventV2) => {
    const correlationId = event.requestContext.requestId;
    const auth = (
      event.requestContext as typeof event.requestContext & {
        authorizer?: {
          lambda?: {
            userId?: string;
            csrfToken?: string;
            role?: 'admin' | 'user';
            groupIds?: string;
          };
        };
      }
    ).authorizer?.lambda;
    const actorId = auth?.userId;
    if (!actorId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);

    const actor: ContentActor = {
      id: actorId,
      role: auth.role ?? 'user',
      active: true,
      groupIds: auth.groupIds?.split(',').filter(Boolean) ?? [],
    };

    try {
      const operationId = event.pathParameters?.operationId;
      if (operationId && event.requestContext.http.method === 'GET') {
        const local = operationResults.get(operationId);
        const stored =
          (await input.service.operationStatus?.(actorId, operationId)) ??
          (local?.ownerId === actorId ? local.result : undefined);
        return stored
          ? json(200, { operationId, mutationId: operationId, ...stored })
          : problem(404, 'not_found', 'Stack operation not found.', correlationId);
      }

      const projectId = event.pathParameters?.projectId;
      const scope = personalStackScopeSchema.parse(
        projectId
          ? { userId: actorId, scopeType: 'project', scopeId: projectId }
          : { userId: actorId, scopeType: 'overall' },
      );
      if (event.requestContext.http.method === 'GET') {
        const query = stackPageQuerySchema.parse(event.queryStringParameters ?? {});
        const result = await input.service.read({ actorId, actor, scope });
        const scopeIdentity = stackScopeIdentity(scope);
        const dynamicContext = input.loadPaginationContext
          ? await input.loadPaginationContext({ actorId, scopeIdentity })
          : { accessEpoch: 0, sourceEpochs: { membership: 0 } };
        const filters = {
          ...(query.urgencies ? { urgencies: query.urgencies.split(',') as Urgency[] } : {}),
          lifecycle: 'active' as const,
          contentType: query.contentType,
        };
        type HandlerCandidate = FilteredStackCandidate & {
          work: (typeof result.items)[number];
        };
        const candidates: HandlerCandidate[] = result.items.map((work, index) => ({
          ...work,
          id: work.workId,
          work,
          lifecycle: 'active',
          contentType: work.workType === 'task' ? 'todos' : 'lists',
          canonicalPosition: index + 1,
          sourcePage: Math.floor(index / 250),
        }));
        let page;
        try {
          page = await readFilteredStackPage({
            context: {
              actorId,
              accessEpoch: dynamicContext.accessEpoch,
              endpoint: scope.scopeType === 'overall' ? 'overall_stack' : 'project_stack',
              scope: scopeIdentity,
              orderBy: scope.scopeType === 'overall' ? 'overallRank' : 'projectRank',
              filters,
              sourceEpochs: dynamicContext.sourceEpochs,
              stackVersion: result.version,
              ...(dynamicContext.snapshotGeneration === undefined
                ? {}
                : { snapshotGeneration: dynamicContext.snapshotGeneration }),
              tailWatermark:
                dynamicContext.tailWatermark ??
                (result.items.length ? workReferenceIdentity(result.items.at(-1)!) : 'empty'),
              now: Date.now(),
            },
            candidates,
            limit: query.limit,
            ...(query.cursor ? { cursor: query.cursor } : {}),
            cursorSecret: input.cursorSecret,
          });
        } catch (error) {
          if (error instanceof PaginationCursorError)
            return problem(error.status, error.code, error.message, correlationId);
          throw error;
        }
        return json(200, {
          scope: scope.scopeType,
          ...(scope.scopeType === 'project' ? { projectId: scope.scopeId } : {}),
          version: result.version,
          snapshotThroughVersion: result.version,
          asOf: new Date().toISOString(),
          items: page.items.map((candidate) => ({
            work: candidate.work,
            rank: {
              overallPosition: candidate.canonicalPosition,
              ...(scope.scopeType === 'project'
                ? { projectPosition: candidate.canonicalPosition }
                : {}),
            },
          })),
          nextCursor: page.nextCursor,
        });
      }

      requireMutationSecurity(
        event.headers.origin,
        auth?.csrfToken ?? '',
        event.headers['x-csrf-token'],
      );
      const headers = reorderHeadersSchema.parse(event.headers);
      const request = reorderRequestSchema.parse(JSON.parse(event.body ?? '{}'));
      if (request.scope !== scope.scopeType)
        return problem(
          400,
          'invalid_scope',
          'Stack scope does not match the route.',
          correlationId,
        );
      const result = await input.service.reorder({
        actorId,
        actor,
        scope,
        mutationId: headers['x-client-mutation-id'],
        sourceClientId: headers['x-client-id'],
        baseVersion: request.baseVersion,
        move: personalStackMoveSchema.parse(request.move),
      });
      const operation = headers['x-client-mutation-id'];
      operationResults.set(operation, { ownerId: actorId, result });
      if (result.status === 'conflict')
        return json(409, {
          code: 'stack_conflict',
          message: 'Reload this stack and try again.',
          correlationId,
          reason: result.reason,
          currentVersion: result.stackVersion,
        });
      if (result.status === 'pending_compaction' && input.onPendingCompaction)
        await input.onPendingCompaction(scope, actor);
      return json(result.status === 'pending_compaction' ? 202 : 200, {
        operationId: operation,
        mutationId: operation,
        ...result,
      });
    } catch (error) {
      return errorResponse(error, {
        correlationId,
        operation: 'personal-stack.request',
        actorId,
      });
    }
  };
}

export const handler: APIGatewayProxyHandlerV2 = createPersonalStackHandler({
  service: defaultPersonalStackService,
  cursorSecret: process.env.CURSOR_SIGNING_SECRET ?? 'local-personal-stack-cursor-secret',
  onPendingCompaction: dispatchStackCompaction,
});
