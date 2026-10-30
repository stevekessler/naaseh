import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { recordError, SafeApiError } from '../shared/http.js';
import { problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { financeActorFor } from './actor.js';
import type { FinanceActor } from './authorization.js';
import { commitDurableCsv, financeSnapshotToken } from './sync-runtime.js';
import { csvImportChunkInputSchema } from '@naaseh/contracts';
import { json } from '../shared/http.js';
import { getRecord } from '../shared/store.js';
import { FinanceMemoryRepository } from './repository.js';
import { DynamoFinanceRepository } from './durable-repository.js';
import { FinanceRouteRegistry, registerUserStory1FinanceRoutes } from './handlers.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const durable = new DynamoFinanceRepository();

export function createDefaultFinanceRegistry(
  repository: FinanceMemoryRepository,
  actor?: FinanceActor,
  snapshotToken?: string,
) {
  return registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
    repository,
    // Dispatch follows a durable outbox; the scheduled worker drains committed jobs.
    lambda: { send: async () => ({}) },
    actorFor: (event) => actor ?? financeActorFor(event),
    ...(snapshotToken ? { snapshotToken } : {}),
    validateAssignee: async (id) => {
      const user = await getRecord<{ data?: { active?: boolean } }>(`USER#${id}`, 'PROFILE');
      if (!user?.data?.active) throw new Error('Finance record not found.');
    },
    deletionSigningSecret: process.env.CURSOR_SIGNING_SECRET ?? 'local-finance-deletion-secret',
    allowedSimplefinHosts: (
      process.env.NAASEH_SIMPLEFIN_ALLOWED_HOSTS ?? 'bridge.simplefin.org,beta-bridge.simplefin.org'
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    ...(process.env.NAASEH_FINANCE_IMPORT_FUNCTION_NAME
      ? { importFunctionName: process.env.NAASEH_FINANCE_IMPORT_FUNCTION_NAME }
      : {}),
  });
}

export function createFinanceHandler(registry?: FinanceRouteRegistry) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const correlationId = event.requestContext.requestId;
    const auth = (event.requestContext as { authorizer?: { lambda?: unknown } }).authorizer
      ?.lambda as { userId?: string; csrfToken?: string } | undefined;
    if (!auth?.userId)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    try {
      if (Buffer.byteLength(event.body ?? '', 'utf8') > 1_000_000) {
        return problem(413, 'request_too_large', 'Request is too large.', correlationId);
      }
      if (mutationMethods.has(event.requestContext.http.method)) {
        requireMutationSecurity(
          event.headers.origin,
          auth.csrfToken ?? '',
          event.headers['x-csrf-token'],
        );
        if (!event.headers['idempotency-key'] || event.headers['idempotency-key'].length > 200) {
          return problem(
            400,
            'finance_idempotency_required',
            'An idempotency key is required.',
            correlationId,
          );
        }
      }
      const csvAccount =
        !registry && event.requestContext.http.method === 'POST'
          ? /^\/api\/v1\/finance\/accounts\/([^/]+)\/csv-imports$/u.exec(event.rawPath)?.[1]
          : undefined;
      if (csvAccount) {
        const input = csvImportChunkInputSchema.parse(
          JSON.parse(
            event.isBase64Encoded
              ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
              : (event.body ?? '{}'),
          ),
        );
        return json(
          201,
          await commitDurableCsv(
            await financeActorFor(event),
            { ...input, accountId: decodeURIComponent(csvAccount) },
            durable,
          ),
        );
      }
      const snapshotRequest = !registry && event.rawPath === '/api/v1/finance/sync/bootstrap';
      const snapshotActor = snapshotRequest ? await financeActorFor(event) : undefined;
      // Ordinary task privacy can change without advancing the Finance epoch.
      const taskPolicy = snapshotActor ? await durable.load(['financialTaskLinks']) : undefined;
      if (
        snapshotActor &&
        taskPolicy?.repository.financialTaskLinks.size === 0 &&
        event.queryStringParameters?.known ===
          financeSnapshotToken(snapshotActor, await durable.clock())
      )
        return json(304, undefined);
      const accountRoute = /^\/api\/v1\/finance\/accounts(?:\/[^/]+)?$/u.test(event.rawPath);
      const simpleTransactionCreate =
        event.requestContext.http.method === 'POST' &&
        /^\/api\/v1\/finance\/accounts\/[^/]+\/transactions$/u.test(event.rawPath);
      const collections = accountRoute || simpleTransactionCreate ? ['accounts'] : undefined;
      const session = registry
        ? undefined
        : await durable.load(
            collections,
            `${auth.userId}:${event.headers['idempotency-key'] ?? ''}`,
          );
      const routes =
        registry ??
        createDefaultFinanceRegistry(
          session!.repository,
          snapshotActor,
          snapshotActor ? financeSnapshotToken(snapshotActor, session!.version) : undefined,
        );
      const route = routes.resolve(
        event.requestContext.http.method,
        event.routeKey.split(' ').slice(1).join(' '),
      );
      const matched = route
        ? { handler: route, parameters: event.pathParameters }
        : routes.match(event.requestContext.http.method, event.rawPath);
      const response = matched
        ? await matched.handler({
            ...event,
            ...(matched.parameters ? { pathParameters: matched.parameters } : {}),
          })
        : problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
      if (session && typeof response === 'object' && Number(response.statusCode) < 400)
        await session.commit();
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const mapped =
        message === 'Finance record not found.' || message === 'Finance connection not found.'
          ? new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'not_found')
          : message.includes('only one budget') || message.includes('Choose one budget')
            ? new SafeApiError(
                409,
                'finance_budget_assignment_conflict',
                'Choose one budget for this transaction. Unlink an existing match before moving it to another budget.',
                'conflict',
              )
            : message.includes('version conflict') || message.includes('stale')
              ? new SafeApiError(
                  409,
                  'finance_conflict',
                  'The Finance record changed. Refresh and try again.',
                  'conflict',
                )
              : message.includes('Budget reconciliation') ||
                  message.includes('contributing transaction') ||
                  message.includes('transaction allocation') ||
                  message.includes('refreshes to finish')
                ? new SafeApiError(
                    409,
                    'finance_reconciliation_blocked',
                    'Budget reconciliation prerequisites changed. Refresh and review the budget.',
                    'conflict',
                  )
                : message.startsWith('Finance page limit')
                  ? new SafeApiError(
                      400,
                      'invalid_request',
                      'The page limit is invalid.',
                      'validation',
                    )
                  : message.includes('cooldown')
                    ? new SafeApiError(
                        429,
                        'finance_refresh_cooldown',
                        'SimpleFIN refresh cooldown is active.',
                        'throttled',
                        false,
                        3600,
                      )
                    : error;
      const safe = recordError(mapped, {
        correlationId,
        operation: 'finance.request',
        actorId: auth.userId,
      });
      return problem(safe.status, safe.code, safe.safeMessage, correlationId);
    }
  };
}

export const handler = createFinanceHandler();
