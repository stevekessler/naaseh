import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { log } from '@naaseh/observability';
import { financeSecurityResponseSchema, financeUnlockResponseSchema } from '@naaseh/contracts';
import { createFinanceSecurityService } from './finance-security-service.js';
import type { FinanceSecurityContext } from './finance-security-repository.js';
import { classifyError, errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';

/** Canonical cookie authentication is supplied by the existing auth entry point. */
export function createFinanceSecurityHttpHandler(options: {
  authenticate: (
    event: APIGatewayProxyEventV2,
  ) => Promise<(FinanceSecurityContext & { csrfToken: string }) | undefined>;
  service?: ReturnType<typeof createFinanceSecurityService>;
}) {
  let service = options.service;
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2 | undefined> => {
    const path = event.rawPath;
    const preference = path === '/api/v1/auth/finance-security';
    const unlock = path === '/api/v1/auth/finance-unlocks';
    const revoke = path === '/api/v1/auth/finance-unlocks/current';
    if (!preference && !unlock && !revoke) return undefined;
    service ??= createFinanceSecurityService();
    const correlationId = event.requestContext.requestId;
    const method = event.requestContext.http.method;
    const operation = preference
      ? 'finance.security'
      : revoke
        ? 'finance.revoke'
        : 'finance.unlock';
    try {
      const authenticated = await options.authenticate(event);
      if (!authenticated)
        throw new SafeApiError(401, 'unauthorized', 'Authentication required.', 'authorization');
      if (!(preference ? ['GET', 'PUT', 'PATCH'] : unlock ? ['POST'] : ['DELETE']).includes(method))
        return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
      const context = { userId: authenticated.userId, sessionHash: authenticated.sessionHash };
      if (method !== 'GET')
        requireMutationSecurity(
          event.headers.origin,
          authenticated.csrfToken,
          event.headers['x-csrf-token'],
        );
      const body = () => {
        const value = event.isBase64Encoded
          ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
          : (event.body ?? '');
        if (Buffer.byteLength(value) > 16_384)
          throw new SafeApiError(400, 'invalid_request', 'The request is invalid.', 'validation');
        return JSON.parse(value) as unknown;
      };
      let result: unknown;
      if (preference) {
        result = financeSecurityResponseSchema.parse(
          method === 'GET'
            ? await service.get(context)
            : method === 'PUT'
              ? await service.update(context, body())
              : await service.setRequirement(context, body()),
        );
      } else if (unlock) {
        result = financeUnlockResponseSchema.parse(await service.unlock(context, body()));
      } else {
        await service.revoke(context, event.headers['x-finance-unlock'] ?? '');
      }
      // Do not log credentials, grants, bodies, or add a paid metric series for these operations.
      log('auth.finance_security', { operation, outcome: 'success', correlationId });
      return json(revoke ? 204 : 200, result);
    } catch (error) {
      const safe = classifyError(error);
      log('auth.finance_security', {
        operation,
        outcome: safe.status === 429 ? 'throttled' : safe.status < 500 ? 'denied' : 'failed',
        correlationId,
      });
      return errorResponse(error, { operation, correlationId });
    }
  };
}
