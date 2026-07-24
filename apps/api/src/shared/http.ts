import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ZodError } from 'zod';
import { log, metric } from '@naaseh/observability';

const securityHeaders = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { ...securityHeaders, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export const problem = (
  status: number,
  code: string,
  message: string,
  correlationId: string,
  headers: Record<string, string> = {},
) =>
  json(
    status,
    {
      type: `urn:naaseh:problem:${code}`,
      title: message,
      status,
      code,
      message,
      correlationId,
    },
    { 'content-type': 'application/problem+json', ...headers },
  );

export type ErrorClassification =
  | 'validation'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'throttled'
  | 'retryable_dependency'
  | 'dependency_failure'
  | 'internal';

export class SafeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly safeMessage: string,
    readonly classification: ErrorClassification,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(safeMessage);
    this.name = 'SafeApiError';
  }
}

interface ErrorLike {
  name?: string;
  code?: string;
  statusCode?: number;
  $metadata?: { httpStatusCode?: number };
}

const retryableNames = new Set([
  'InternalServerError',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'ServiceUnavailable',
  'ThrottlingException',
]);

export function classifyError(error: unknown): SafeApiError {
  if (error instanceof SafeApiError) return error;
  if (error instanceof ZodError || error instanceof SyntaxError)
    return new SafeApiError(400, 'invalid_request', 'The request is invalid.', 'validation');

  const candidate = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  if (candidate.statusCode === 401)
    return new SafeApiError(401, 'unauthorized', 'Authentication required.', 'authorization');
  if (candidate.statusCode === 403)
    return new SafeApiError(403, 'forbidden', 'Request rejected.', 'authorization');
  if (
    candidate.name === 'ConditionalCheckFailedException' ||
    candidate.name === 'TransactionCanceledException'
  )
    return new SafeApiError(
      409,
      'conflict',
      'The resource changed. Refresh and try again.',
      'conflict',
    );
  if (candidate.name && retryableNames.has(candidate.name))
    return new SafeApiError(
      503,
      'temporarily_unavailable',
      'The service is temporarily unavailable. Try again.',
      'retryable_dependency',
      true,
      1,
    );
  if (candidate.$metadata?.httpStatusCode)
    return new SafeApiError(
      502,
      'dependency_failure',
      'A required service could not complete the request.',
      'dependency_failure',
      true,
      1,
    );
  return new SafeApiError(
    500,
    'internal_error',
    'The request could not be completed.',
    'internal',
    true,
    1,
  );
}

export interface ErrorContext {
  correlationId: string;
  operation: string;
  actorId?: string | undefined;
  resourceId?: string | undefined;
}

export function recordError(error: unknown, context: ErrorContext): SafeApiError {
  const classified = classifyError(error);
  log('api.request_failed', {
    correlationId: context.correlationId,
    operationName: context.operation,
    actorId: context.actorId,
    resourceId: context.resourceId,
    outcome: 'failure',
    errorClass: classified.classification,
    statusCode: classified.status,
    retryable: classified.retryable,
  });
  metric('ApiRequestFailures', 1, 'Count', {
    errorClass: classified.classification,
    retryable: classified.retryable,
  });
  return classified;
}

/** Convert failures to safe client responses and correlated structured events. */
export function errorResponse(error: unknown, context: ErrorContext): APIGatewayProxyResultV2 {
  const classified = recordError(error, context);
  return problem(
    classified.status,
    classified.code,
    classified.safeMessage,
    context.correlationId,
    classified.retryAfterSeconds ? { 'retry-after': String(classified.retryAfterSeconds) } : {},
  );
}
