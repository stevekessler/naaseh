import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { recordError, SafeApiError } from '../shared/http.js';
import { json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { listUserMemberships } from '../groups/group-repository.js';
import { FinanceMemoryRepository } from './repository.js';
import { FinanceRouteRegistry, registerUserStory1FinanceRoutes } from './handlers.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const runtimeRepository = new FinanceMemoryRepository();

export function createDefaultFinanceRegistry() {
  return registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
    repository: runtimeRepository,
    actorFor: async (event) => {
      const auth = (
        event.requestContext as { authorizer?: { lambda?: { userId?: string; role?: string } } }
      ).authorizer?.lambda;
      const memberships = auth?.userId ? await listUserMemberships(auth.userId) : [];
      return {
        id: auth?.userId ?? '',
        role: auth?.role === 'admin' ? 'admin' : 'user',
        active: true,
        groupMemberships: memberships
          .filter((membership) => membership.status === 'active')
          .map(({ groupId, role }) => ({ groupId, role })),
      };
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

export function createFinanceHandler(registry = createDefaultFinanceRegistry()) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const correlationId = event.requestContext.requestId;
    const auth = (event.requestContext as { authorizer?: { lambda?: unknown } }).authorizer
      ?.lambda as { userId?: string; csrfToken?: string } | undefined;
    if (!auth?.userId)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    try {
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
      const route = registry.resolve(
        event.requestContext.http.method,
        event.routeKey.split(' ').slice(1).join(' '),
      );
      return route
        ? await route(event)
        : problem(404, 'finance_not_found', 'Finance record not found.', correlationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const mapped =
        message === 'Finance record not found.' || message === 'Finance connection not found.'
          ? new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'not_found')
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
export const healthFinanceResponse = () => json(200, { status: 'ok' });
