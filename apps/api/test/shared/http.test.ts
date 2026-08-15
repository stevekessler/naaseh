import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { classifyError, errorResponse, SafeApiError } from '../../src/shared/http.js';

afterEach(() => vi.restoreAllMocks());

describe('safe API error classification', () => {
  it.each([
    [z.string().min(2).safeParse('').error, 400, 'invalid_request', 'validation', false],
    [
      Object.assign(new Error('secret'), { statusCode: 403 }),
      403,
      'forbidden',
      'authorization',
      false,
    ],
    [
      Object.assign(new Error('missing'), { statusCode: 404 }),
      404,
      'not_found',
      'not_found',
      false,
    ],
    [
      Object.assign(new Error('secret'), { name: 'TransactionCanceledException' }),
      409,
      'conflict',
      'conflict',
      false,
    ],
    [
      Object.assign(new Error('secret'), { name: 'ThrottlingException' }),
      503,
      'temporarily_unavailable',
      'retryable_dependency',
      true,
    ],
    [
      Object.assign(new Error('secret'), { $metadata: { httpStatusCode: 502 } }),
      502,
      'dependency_failure',
      'dependency_failure',
      true,
    ],
    [new Error('private memo text'), 500, 'internal_error', 'internal', true],
  ])(
    'maps a failure without exposing its original details',
    (source, status, code, classification, retryable) => {
      const result = classifyError(source);
      expect(result).toMatchObject({ status, code, classification, retryable });
      expect(result.safeMessage).not.toContain('secret');
      expect(result.safeMessage).not.toContain('private memo text');
    },
  );

  it('preserves intentional safe errors', () => {
    const error = new SafeApiError(404, 'not_found', 'Resource not found.', 'not_found');
    expect(classifyError(error)).toBe(error);
  });

  it('returns problem details and emits correlated safe structured logging', () => {
    const sink = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = errorResponse(new Error('password=do-not-log'), {
      correlationId: 'correlation-1',
      operation: 'test.failure',
      actorId: 'user-1',
    });
    expect(response).toMatchObject({
      statusCode: 500,
      headers: { 'content-type': 'application/problem+json', 'retry-after': '1' },
    });
    expect(response.body).toContain('correlation-1');
    expect(response.body).not.toContain('do-not-log');
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0]?.[0]).toContain('correlation-1');
    expect(sink.mock.calls[0]?.[0]).not.toContain('do-not-log');
    expect(sink.mock.calls[1]?.[0]).toContain('ApiRequestFailures');
  });
});
