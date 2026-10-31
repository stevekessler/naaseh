import { describe, expect, it } from 'vitest';
import { createLogger, redact } from '@naaseh/observability';
import { financeExperienceEvent } from '../../apps/api/src/finance/telemetry.js';

describe('Finance experience bounded operational evidence', () => {
  it('rejects payload fields and redacts nested security, receipt and financial metadata', () => {
    const event = financeExperienceEvent({
      operation: 'projection',
      outcome: 'failed',
      correlationId: 'req-1',
      errorCategory: 'invariant',
      durationMs: 250,
      examined: 100,
    });
    expect(event).toMatchObject({
      operation: 'finance.projection',
      outcome: 'failed',
      latencyBucket: '100-999ms',
      examined: 100,
      errorCategory: 'invariant',
      schemaVersion: 2,
    });
    expect(() =>
      financeExperienceEvent({
        operation: 'query',
        outcome: 'success',
        correlationId: 'req-1',
        durationMs: 0,
        financeGrant: 'must-not-log',
      } as never),
    ).toThrow();
    const protectedValues = {
      financeGrant: 'secret-grant',
      offlineVerifier: 'secret-verifier',
      tabNonce: 'secret-tab',
      checkNumber: '0012',
      originalAllocationId: 'private-allocation',
      receiptId: 'private-receipt',
      principalMinor: 100,
      fileName: 'private.docx',
    };
    expect(Object.values(redact(protectedValues) as Record<string, unknown>)).toEqual(
      Array(8).fill('[REDACTED]'),
    );
  });

  it('keeps metric descriptors valid while excluding protected context and rejecting unbounded event inputs', () => {
    const lines: string[] = [];
    const logger = createLogger({}, { sink: (line) => lines.push(line) });
    logger.metric('FinanceDataIntegrityFailures', 1, 'Count', {
      filename: 'private.pdf',
      correlationId: 'req-2',
    });
    const line = JSON.parse(lines[0]!);
    expect(line._aws.CloudWatchMetrics[0].Metrics[0].Name).toBe('FinanceDataIntegrityFailures');
    expect(line.filename).toBe('[REDACTED]');
    for (const extra of [
      { durationMs: -1 },
      { examined: 1_001 },
      { errorCategory: 'raw secret message' },
      { correlationId: 'private file.pdf' },
    ])
      expect(() =>
        financeExperienceEvent({
          operation: 'query',
          outcome: 'failed',
          correlationId: 'req-1',
          durationMs: 100,
          ...extra,
        } as never),
      ).toThrow();
  });
});
