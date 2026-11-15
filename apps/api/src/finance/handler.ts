import { FinanceCacheProofService, type FinanceCacheAuthorizationSnapshot } from './cache-proof.js';
import { financeReplayFingerprint } from './mutation-intent.js';
import { assertFinanceTaskResultAccess, FinanceSyncSourceGuard } from './sync-source-guard.js';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import {
  financePublicationWorkerEnvelopeSchema,
  financePublicationRecoveryEnvelopeSchema,
  financePublicationSignalEnvelopeSchema,
} from './publication-invocation.js';
import { executeFinancePublicationRecovery } from './publication-recovery.js';
import { executeFinancePublicationWorker } from './publication-worker.js';
import { recordError, SafeApiError } from '../shared/http.js';
import { json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { getMembership, listUserMemberships } from '../groups/group-repository.js';
import { DynamoFinanceRepository } from './dynamo-repository.js';
import { FinanceRouteRegistry, registerUserStory1FinanceRoutes } from './handlers.js';
import {
  dispatchFinanceInvocation,
  type financeQueryWorkerEnvelopeSchema,
} from './query-worker.js';
import {
  checkIndexedCsvDuplicates,
  createFinanceQueryRuntime,
  executeFinanceQueryWorker,
} from './query-runtime.js';
import { ulidSchema } from '@naaseh/domain';
import {
  csvDuplicateCheckSchema,
  financeQueryStartSchema,
  financeQueryPageSchema,
  financeBudgetAccountLinkInputSchema,
  financeBudgetItemInputSchema,
  financeBudgetInputSchema,
  financeReusableItemInputSchema,
  manualFinanceTransactionReplayInputSchema,
} from '@naaseh/contracts';
import { FinanceExperienceFailure } from './telemetry.js';
import type { z } from 'zod';
import { createFinanceUnlockGuard, assertFinanceClientUser } from './finance-unlock-guard.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const financeSnapshotPaths = [
  /^\/api\/v1\/finance\/(?:accounts(?:\/[0-9A-HJKMNP-TV-Z]{26}\/transactions)?|connections|categories|merchants(?:\/[0-9A-HJKMNP-TV-Z]{26})?|tasks\/[0-9A-HJKMNP-TV-Z]{26}\/(?:link|finance-links)|review-issues)$/u,
  /^\/api\/v1\/finance\/transactions\/[0-9A-HJKMNP-TV-Z]{26}(?::[1-9][0-9]{0,4})?$/u,
  /^\/api\/v1\/finance\/transactions\/[0-9A-HJKMNP-TV-Z]{26}(?:(?::|%3[Aa])[1-9][0-9]{0,4})?\/matches$/u,
  /^\/api\/v1\/finance\/(?:budgets(?:\/[0-9A-HJKMNP-TV-Z]{26}(?:\/reusable-offers)?)?|reusable-items)$/u,
  /^\/api\/v1\/finance\/upcoming-expenses(?:\/[0-9A-HJKMNP-TV-Z]{26})?$/u,
  /^\/api\/v1\/finance\/(?:transactions\/[0-9A-HJKMNP-TV-Z]{26}|upcoming-expenses\/[0-9A-HJKMNP-TV-Z]{26})\/tasks$/u,
  /^\/api\/v1\/finance\/records\/(?:transaction\/[0-9A-HJKMNP-TV-Z]{26}(?:(?::|%3[Aa])[1-9][0-9]{0,4})?|(?:account|reusable-item|match|category|merchant)\/[0-9A-HJKMNP-TV-Z]{26})\/deletion-preview$/u,
];

export async function createDefaultFinanceRegistry(event: APIGatewayProxyEventV2) {
  const auth = (
    event.requestContext as { authorizer?: { lambda?: { userId?: string; role?: string } } }
  ).authorizer?.lambda;
  const discovered = auth?.userId ? await listUserMemberships(auth.userId) : [];
  const memberships = (
    await Promise.all(
      discovered
        .filter((candidate) => candidate.status === 'active')
        .map(async (candidate) => {
          const current = await getMembership(candidate.groupId, auth!.userId!);
          return current?.status === 'active' &&
            current.userId === auth!.userId &&
            current.groupId === candidate.groupId
            ? [current]
            : [];
        }),
    )
  ).flat();
  const actor = {
    id: auth?.userId ?? '',
    role: auth?.role === 'admin' ? ('admin' as const) : ('user' as const),
    active: true,
    groupMemberships: memberships
      .filter((membership) => membership.status === 'active')
      .map(({ groupId, role }) => ({ groupId, role })),
  };
  const repository = await DynamoFinanceRepository.forActor(
    actor,
    mutationMethods.has(event.requestContext.http.method)
      ? event.headers['idempotency-key']
      : undefined,
    event.headers['x-finance-sync-replay'] !== undefined
      ? financeReplayFingerprint(
          event,
          event.headers['x-finance-sync-replay'] as
            | 'budget-edit-v1'
            | 'budget-create-v1'
            | 'budget-account-link-create-v1'
            | 'budget-item-create-v1'
            | 'manual-transaction-create-v1'
            | 'upcoming-expense-create-v1'
            | 'expense-fulfillment-create-v1'
            | 'task-link-create-v1'
            | 'reusable-create-v1',
        )
      : undefined,
    event.headers['x-finance-sync-replay'] === 'budget-edit-v1'
      ? event.rawPath.split('/').at(-1)
      : undefined,
    event.headers['x-finance-sync-replay'] === 'reusable-create-v1'
      ? {
          id: event.rawPath.split('/').at(-1)!,
          ...financeReusableItemInputSchema.parse(JSON.parse(event.body ?? '{}')),
        }
      : undefined,
    event.headers['x-finance-sync-replay'] === 'budget-create-v1'
      ? {
          id: event.rawPath.split('/').at(-1)!,
          groupId: financeBudgetInputSchema.parse(JSON.parse(event.body ?? '{}')).groupId,
        }
      : undefined,
    event.headers['x-finance-sync-replay'] === 'budget-account-link-create-v1'
      ? {
          id: financeBudgetAccountLinkInputSchema.parse(JSON.parse(event.body ?? '{}')).id!,
          budgetId: event.rawPath.split('/').at(-2)!,
          accountId: financeBudgetAccountLinkInputSchema.parse(JSON.parse(event.body ?? '{}'))
            .accountId,
        }
      : undefined,
    event.headers['x-finance-sync-replay'] === 'budget-item-create-v1'
      ? {
          ...financeBudgetItemInputSchema.parse(JSON.parse(event.body ?? '{}')),
          id: financeBudgetItemInputSchema.parse(JSON.parse(event.body ?? '{}')).id!,
          budgetId: event.rawPath.split('/').at(-2)!,
        }
      : undefined,
    event.headers['x-finance-sync-replay'] === 'manual-transaction-create-v1'
      ? (() => {
          const input = manualFinanceTransactionReplayInputSchema.parse(
            JSON.parse(event.body ?? '{}'),
          );
          return {
            id: input.id,
            accountId: event.rawPath.split('/').at(-2)!,
            ...(input.merchantId ? { merchantId: input.merchantId } : {}),
            financeCategoryIds: [
              ...new Set(
                (input.allocations ?? []).flatMap(({ financeCategoryId, subcategoryId }) => [
                  financeCategoryId,
                  ...(subcategoryId ? [subcategoryId] : []),
                ]),
              ),
            ],
          };
        })()
      : undefined,
  );
  const taskLinkRoute = event.rawPath.match(
    /^\/api\/v1\/finance\/tasks\/([0-9A-HJKMNP-TV-Z]{26})\/finance-links(?:\/[^/]+)?$/u,
  );
  if (taskLinkRoute?.[1]) await repository.loadTaskForFinanceLink(taskLinkRoute[1]);
  const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
    repository,
    actorFor: () => actor,
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
  let responseTasks: FinanceCacheAuthorizationSnapshot['tasks'] = [];
  return {
    registry,
    repository,
    recheckTaskResponse: async (response: APIGatewayProxyResultV2) => {
      if (typeof response === 'object' && response.body)
        responseTasks = await assertFinanceTaskResultAccess(JSON.parse(response.body), {
          ...actor,
          groupIds: actor.groupMemberships.map(({ groupId }) => groupId),
        });
    },
    // Only the explicit routes below opt in. Task dependencies come from the
    // same final canonical response check and receive both proof verification rounds.
    cacheProof: async (authorize: () => Promise<unknown>, previous?: string) => {
      const scopes = repository.cacheAuthorizationScopes();
      return new FinanceCacheProofService({
        userId: actor.id,
        role: actor.role,
        secret: process.env.CURSOR_SIGNING_SECRET ?? '',
        authorize,
      }).issue(
        {
          cacheAuthorizationSnapshot: async () => ({
            userId: actor.id,
            scopes,
            members: memberships
              .filter((member) =>
                scopes.some(({ PK }) => PK === `FINANCE#SCOPE#GROUP#${member.groupId}`),
              )
              .map((member) => ({
                groupId: member.groupId,
                role: member.role,
                ...(member.version === undefined ? {} : { version: member.version }),
              })),
            tasks: responseTasks,
          }),
        },
        previous,
      );
    },
    recheckMemberships: async () => {
      for (const original of memberships) {
        const current = await getMembership(original.groupId, auth!.userId!);
        if (
          !current ||
          current.status !== 'active' ||
          current.userId !== auth!.userId ||
          current.groupId !== original.groupId ||
          current.role !== original.role
        )
          throw new SafeApiError(
            403,
            'finance_access_changed',
            'Finance access changed. Refresh and try again.',
            'authorization',
          );
      }
    },
  };
}

export function createFinanceHandler(
  registry?: FinanceRouteRegistry,
  authorize = createFinanceUnlockGuard(),
  queryRuntime: (
    options: Parameters<typeof createFinanceQueryRuntime>[0],
  ) => Pick<
    ReturnType<typeof createFinanceQueryRuntime>,
    'status' | 'start' | 'page'
  > = createFinanceQueryRuntime,
  csvDuplicates = checkIndexedCsvDuplicates,
) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const correlationId = event.requestContext.requestId;
    const auth = (event.requestContext as { authorizer?: { lambda?: unknown } }).authorizer
      ?.lambda as { userId?: string; csrfToken?: string; sessionHash?: string } | undefined;
    if (!auth?.userId)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    try {
      assertFinanceClientUser(auth.userId, event.headers['x-finance-owner']);
      const snapshotProtocol = event.headers['x-finance-cache-protocol'];
      const priorSnapshot = event.headers['x-finance-cache-proof'];
      const snapshotRequested = snapshotProtocol !== undefined || priorSnapshot !== undefined;
      if (
        snapshotRequested &&
        (snapshotProtocol !== '1' ||
          event.requestContext.http.method !== 'GET' ||
          !financeSnapshotPaths.some((path) => path.test(event.rawPath)) ||
          (priorSnapshot !== undefined && (!priorSnapshot || priorSnapshot.length > 4000)))
      )
        return problem(
          400,
          'invalid_finance_snapshot',
          'This Finance snapshot request is not supported.',
          correlationId,
        );
      const replayKind = event.headers['x-finance-sync-replay'];
      const reusableCreatePath =
        /^\/api\/v1\/finance\/reusable-items\/[0-9A-HJKMNP-TV-Z]{26}$/u.test(event.rawPath);
      const budgetCreatePath = /^\/api\/v1\/finance\/budgets\/[0-9A-HJKMNP-TV-Z]{26}$/u.test(
        event.rawPath,
      );
      const budgetAccountLinkCreatePath =
        /^\/api\/v1\/finance\/budgets\/[0-9A-HJKMNP-TV-Z]{26}\/accounts$/u.test(event.rawPath);
      const budgetItemCreatePath =
        /^\/api\/v1\/finance\/budgets\/[0-9A-HJKMNP-TV-Z]{26}\/items$/u.test(event.rawPath);
      const manualTransactionCreatePath =
        /^\/api\/v1\/finance\/accounts\/[0-9A-HJKMNP-TV-Z]{26}\/transactions$/u.test(event.rawPath);
      const upcomingExpenseCreatePath = event.rawPath === '/api/v1/finance/upcoming-expenses';
      const expenseFulfillmentCreatePath =
        /^\/api\/v1\/finance\/upcoming-expenses\/[0-9A-HJKMNP-TV-Z]{26}\/fulfillments$/u.test(
          event.rawPath,
        );
      const taskLinkCreatePath =
        /^\/api\/v1\/finance\/tasks\/[0-9A-HJKMNP-TV-Z]{26}\/finance-links$/u.test(
          event.rawPath,
        );
      const validReplay =
        replayKind === 'budget-edit-v1'
          ? event.requestContext.http.method === 'PATCH' &&
            /^\/api\/v1\/finance\/budgets\/[0-9A-HJKMNP-TV-Z]{26}$/u.test(event.rawPath)
          : replayKind === 'budget-create-v1'
            ? event.requestContext.http.method === 'POST' && budgetCreatePath
            : replayKind === 'budget-account-link-create-v1'
              ? event.requestContext.http.method === 'POST' && budgetAccountLinkCreatePath
              : replayKind === 'budget-item-create-v1'
                ? event.requestContext.http.method === 'POST' && budgetItemCreatePath
                : replayKind === 'manual-transaction-create-v1'
                  ? event.requestContext.http.method === 'POST' && manualTransactionCreatePath
                  : replayKind === 'upcoming-expense-create-v1'
                    ? event.requestContext.http.method === 'POST' && upcomingExpenseCreatePath
                    : replayKind === 'expense-fulfillment-create-v1'
                      ? event.requestContext.http.method === 'POST' && expenseFulfillmentCreatePath
                      : replayKind === 'task-link-create-v1'
                        ? event.requestContext.http.method === 'POST' && taskLinkCreatePath
                      : replayKind === 'reusable-create-v1' &&
                        event.requestContext.http.method === 'POST' &&
                        reusableCreatePath;
      if (
        (replayKind !== undefined && !validReplay) ||
        ((reusableCreatePath ||
          (budgetCreatePath && event.requestContext.http.method === 'POST')) &&
          !validReplay)
      )
        return problem(
          400,
          'invalid_finance_replay',
          'This Finance replay request is not supported.',
          correlationId,
        );
      if (mutationMethods.has(event.requestContext.http.method)) {
        requireMutationSecurity(
          event.headers.origin,
          auth.csrfToken ?? '',
          event.headers['x-csrf-token'],
        );
        if (!event.headers['idempotency-key']) {
          return problem(
            400,
            'finance_idempotency_required',
            'An idempotency key is required.',
            correlationId,
          );
        }
      }
      const gate = {
        userId: auth.userId,
        sessionHash: auth.sessionHash ?? '',
        grant: event.headers['x-finance-unlock'],
        tabNonce: event.headers['x-finance-tab'],
        expectedUserId: event.headers['x-finance-owner'],
      };
      const visit = await authorize(gate);
      const csvDuplicatePath = /^\/api\/v1\/finance\/accounts\/([^/]+)\/csv-duplicates$/u.exec(
        event.rawPath,
      );
      if (event.requestContext.http.method === 'POST' && csvDuplicatePath) {
        const accountId = ulidSchema.parse(csvDuplicatePath[1]);
        const input = csvDuplicateCheckSchema.parse(JSON.parse(event.body ?? '{}'));
        const result = await csvDuplicates(auth.userId, accountId, input);
        await authorize(gate);
        return json(200, result);
      }
      const transactionPath = /^\/api\/v1\/finance\/transactions\/([^/]+)$/u.exec(event.rawPath);
      if (event.requestContext.http.method === 'GET' && transactionPath) {
        const id = transactionPath[1]!;
        const legacy = /^([0-9A-HJKMNP-TV-Z]{26}):([1-9][0-9]{0,4})$/u.exec(id);
        if (!ulidSchema.safeParse(id).success && !(legacy && Number(legacy[2]) <= 50000))
          return problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
        const role =
          (event.requestContext as { authorizer?: { lambda?: { role?: string } } }).authorizer
            ?.lambda?.role === 'admin'
            ? 'admin'
            : 'user';
        const source = new FinanceSyncSourceGuard({ userId: auth.userId, role });
        const value = await source.readCanonicalSource('financeTransaction', id);
        if (!value)
          return problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
        if (
          legacy &&
          (value.origin !== 'csv' ||
            value.csvImportBatchId !== legacy[1] ||
            value.csvRowOrdinal !== Number(legacy[2]))
        )
          return problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
        await source.assertCurrent();
        await authorize(gate);
        if (snapshotRequested) {
          const proof = await new FinanceCacheProofService({
            userId: auth.userId,
            role,
            secret: process.env.CURSOR_SIGNING_SECRET ?? '',
            authorize: () => authorize(gate),
          }).issue(source, priorSnapshot);
          if (proof.length > 4000)
            throw new Error('Finance snapshot evidence exceeds the header budget.');
          return json(200, value, { 'x-finance-cache-proof': proof });
        }
        return json(200, value);
      }
      // Resolve owner-only bounded jobs before the legacy registry hydrates scope data.
      const queryPath = /^\/api\/v1\/finance\/queries\/([^/]+)(\/rows)?$/.exec(event.rawPath);
      const createsQuery =
        event.requestContext.http.method === 'POST' && event.rawPath === '/api/v1/finance/queries';
      if ((event.requestContext.http.method === 'GET' && queryPath) || createsQuery) {
        const request = createsQuery
          ? financeQueryStartSchema.parse(JSON.parse(event.body ?? '{}'))
          : queryPath?.[2]
            ? financeQueryPageSchema.parse({
                limit: event.queryStringParameters?.limit ?? 50,
                ...(event.queryStringParameters?.cursor
                  ? { cursor: event.queryStringParameters.cursor }
                  : {}),
              })
            : undefined;
        const queryId = queryPath ? ulidSchema.parse(queryPath[1]) : undefined;
        const jobs = queryRuntime({
          authorizeDelivery: async (job) => {
            const current = await authorize(gate);
            return job.userId === gate.userId && job.securityRevision === current.securityRevision;
          },
        });
        if (createsQuery) {
          const created = await jobs.start(
            auth.userId,
            visit.securityRevision,
            request,
            event.headers['idempotency-key']!,
          );
          await authorize(gate);
          return json(
            202,
            { queryId: created },
            { location: `/api/v1/finance/queries/${created}` },
          );
        }
        const result = queryPath?.[2]
          ? await jobs.page(auth.userId, queryId!, request)
          : await jobs.status(auth.userId, queryId!);
        await authorize(gate);
        return json(
          queryPath?.[2] && result.rowsState === 'searching' ? 202 : 200,
          result,
          queryPath?.[2] && result.rowsState === 'searching' ? { 'retry-after': '1' } : {},
        );
      }
      const runtime = registry ? undefined : await createDefaultFinanceRegistry(event);
      const route = (registry ?? runtime!.registry).resolve(
        event.requestContext.http.method,
        event.rawPath,
      );
      if (!route)
        return problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
      const replayed =
        runtime &&
        replayKind !== undefined &&
        runtime.repository.mutation(auth.userId, event.headers['idempotency-key'] ?? '') !==
          undefined;
      const response = await route(event);
      if (mutationMethods.has(event.requestContext.http.method)) {
        await authorize(gate);
        await runtime?.recheckMemberships();
      }
      await runtime?.repository.commit();
      await authorize(gate);
      await runtime?.recheckMemberships();
      await runtime?.repository.assertReadCurrent();
      await runtime?.recheckTaskResponse(response);
      if (snapshotRequested && typeof response === 'object' && Number(response.statusCode) < 300) {
        if (!runtime) throw new Error('Finance snapshot runtime is unavailable.');
        const proof = await runtime.cacheProof(() => authorize(gate), priorSnapshot);
        if (proof.length > 4000)
          throw new Error('Finance snapshot evidence exceeds the header budget.');
        return { ...response, headers: { ...response.headers, 'x-finance-cache-proof': proof } };
      }
      if (replayed && typeof response === 'object')
        return { ...response, headers: { ...response.headers, 'x-finance-sync-replayed': '1' } };
      return response;
    } catch (error) {
      if (error instanceof FinanceExperienceFailure) {
        const missing = error.errorCategory === 'validation';
        const changed = error.errorCategory === 'authorization';
        return problem(
          missing ? 404 : changed ? 409 : 503,
          missing
            ? 'finance_query_expired'
            : changed
              ? 'finance_query_restart_required'
              : 'finance_query_unavailable',
          missing
            ? 'Finance query missing or expired.'
            : changed
              ? 'Finance query changed. Restart the query.'
              : 'Finance query is temporarily unavailable.',
          correlationId,
        );
      }
      const message = error instanceof Error ? error.message : '';
      const mapped =
        message === 'Finance record not found.' || message === 'Finance connection not found.'
          ? new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'not_found')
          : message.includes('version conflict') ||
              message.includes('stale') ||
              message === 'Budget account is already linked.'
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

const httpFinanceHandler = createFinanceHandler();
export function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>;
export function handler(event: z.infer<typeof financeQueryWorkerEnvelopeSchema>): Promise<void>;
export function handler(
  event: z.infer<typeof financePublicationWorkerEnvelopeSchema>,
  context?: Context,
): Promise<void>;
export function handler(
  event: z.infer<typeof financePublicationRecoveryEnvelopeSchema>,
): Promise<void>;
export function handler(
  event: z.infer<typeof financePublicationSignalEnvelopeSchema>,
  context?: Context,
): Promise<void>;
export async function handler(
  event:
    | APIGatewayProxyEventV2
    | z.infer<typeof financeQueryWorkerEnvelopeSchema>
    | z.infer<typeof financePublicationWorkerEnvelopeSchema>
    | z.infer<typeof financePublicationRecoveryEnvelopeSchema>
    | z.infer<typeof financePublicationSignalEnvelopeSchema>,
  context?: Context,
): Promise<APIGatewayProxyResultV2 | void> {
  return dispatchFinanceInvocation(event, {
    http: (incoming) => httpFinanceHandler(incoming as APIGatewayProxyEventV2),
    worker: executeFinanceQueryWorker,
    recovery: executeFinancePublicationRecovery,
    publication: (input) =>
      executeFinancePublicationWorker(
        input,
        context ? { remainingMs: () => context.getRemainingTimeInMillis() } : {},
      ),
  });
}
export const healthFinanceResponse = () => json(200, { status: 'ok' });
