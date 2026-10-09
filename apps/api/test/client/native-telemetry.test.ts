import { describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  log: vi.fn(),
  metric: vi.fn(),
  requireMutationSecurity: vi.fn(),
}));
vi.mock('@naaseh/observability', () => ({ log: dependencies.log, metric: dependencies.metric }));
vi.mock('../../src/shared/security.js', () => ({
  requireMutationSecurity: dependencies.requireMutationSecurity,
}));
import {
  MAX_NATIVE_TELEMETRY_BYTES,
  parseNativeTelemetryBody,
  recordNativeTelemetry,
} from '../../src/client/native-telemetry.js';
import { handler } from '../../src/client/compatibility-handler.js';

const event = {
  eventId: '02e2a44c-98d0-4d66-96e7-13c25fb049af',
  occurredAt: '2026-10-07T12:00:00.000Z',
  platform: 'ios' as const,
  appVersion: '1.0',
  buildNumber: 25,
  contractVersion: 4,
  operationClass: 'sync' as const,
  outcome: 'retryScheduled' as const,
  errorClass: 'networkUnavailable' as const,
  durationMilliseconds: 150,
  retryable: true,
  queueDepthBucket: 'oneToTen' as const,
  freshnessBucket: 'underHour' as const,
  correlationId: 'dd3bb456-5367-475b-9f2d-f1dc4928c516',
};

describe('native telemetry contract', () => {
  it('accepts only closed batches of 1-50 content-free events', () => {
    expect(parseNativeTelemetryBody(JSON.stringify({ events: [event] })).events).toHaveLength(1);
    expect(() => parseNativeTelemetryBody(JSON.stringify({ events: [] }))).toThrow();
    expect(() =>
      parseNativeTelemetryBody(JSON.stringify({ events: Array.from({ length: 51 }, () => event) })),
    ).toThrow();
    expect(() =>
      parseNativeTelemetryBody(JSON.stringify({ events: [{ ...event, taskTitle: 'protected' }] })),
    ).toThrow();
    expect(() =>
      parseNativeTelemetryBody(JSON.stringify({ events: [event], userId: 'nope' })),
    ).toThrow();
  });

  it('enforces the 32 KiB wire limit before parsing', () => {
    expect(() => parseNativeTelemetryBody('x'.repeat(MAX_NATIVE_TELEMETRY_BYTES + 1))).toThrowError(
      /32 KiB/,
    );
  });

  it('emits bounded content-free logs and metrics', () => {
    const log = vi.fn();
    const metric = vi.fn();
    recordNativeTelemetry({ events: [event] }, { log, metric });
    expect(log).toHaveBeenCalledOnce();
    expect(metric).toHaveBeenCalledOnce();
    const fields = log.mock.calls[0]?.[1];
    expect(fields).toEqual({
      platform: 'ios',
      appVersion: '1.0',
      buildNumber: 25,
      contractVersion: 4,
      operationClass: 'sync',
      outcome: 'retryScheduled',
      errorClass: 'networkUnavailable',
      durationMilliseconds: 150,
      retryable: true,
      queueDepthBucket: 'oneToTen',
      freshnessBucket: 'underHour',
      correlationId: event.correlationId,
    });
    expect(JSON.stringify(fields)).not.toContain('eventId');
    expect(metric.mock.calls[0]?.[3]).toEqual({
      platform: 'ios',
      operationClass: 'sync',
      outcome: 'retryScheduled',
      errorClass: 'networkUnavailable',
      retryable: true,
    });
  });

  it('emits an aggregate alarm signal only for failed or blocked client outcomes', () => {
    const metric = vi.fn();
    recordNativeTelemetry({ events: [{ ...event, outcome: 'failed' }] }, { log: vi.fn(), metric });
    expect(metric).toHaveBeenCalledTimes(2);
    expect(metric.mock.calls[1]).toEqual(['NativeClientFailures', 1, 'Count', {}]);
  });

  it('requires authentication plus Origin/CSRF validation before accepting a batch', async () => {
    const invoke = async (signedIn: boolean) =>
      (await handler(
        {
          headers: {
            origin: 'https://gsd.thepandas.link',
            'x-csrf-token': 'csrf',
            'x-naaseh-client-platform': 'ios',
            'x-naaseh-client-build': '25',
            'x-naaseh-contract-version': '4',
          },
          body: JSON.stringify({ events: [event] }),
          requestContext: {
            requestId: 'request-correlation',
            http: { method: 'POST' },
            ...(signedIn ? { authorizer: { lambda: { userId: 'user', csrfToken: 'csrf' } } } : {}),
          },
        } as never,
        {} as never,
        vi.fn(),
      )) as { statusCode: number };

    expect((await invoke(false)).statusCode).toBe(401);
    expect((await invoke(true)).statusCode).toBe(204);
    expect(dependencies.requireMutationSecurity).toHaveBeenCalledWith(
      'https://gsd.thepandas.link',
      'csrf',
      'csrf',
    );

    dependencies.requireMutationSecurity.mockImplementationOnce(() => {
      throw Object.assign(new Error('Request rejected.'), { statusCode: 403 });
    });
    expect((await invoke(true)).statusCode).toBe(403);
  });
});
