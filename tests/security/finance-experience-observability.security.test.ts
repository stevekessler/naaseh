import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, redact } from '@naaseh/observability';
import {
  FinanceExperienceFailure,
  financeExperienceFailureDetails,
  emitFinanceExperienceEvent,
  financeExperienceEvent,
} from '../../apps/api/src/finance/telemetry.js';

import {
  SpendProjectionService,
  createFinanceFact,
} from '../../apps/api/src/finance/spend-projection-service.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { buildExperienceFixture } from '../fixtures/finance/experience.js';
afterEach(() => vi.restoreAllMocks());

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

  it('classifies only trusted failure metadata and never copies raw errors into events', () => {
    expect(
      financeExperienceFailureDetails(
        new FinanceExperienceFailure('invariant', 'internal source details'),
      ),
    ).toEqual({ errorCategory: 'invariant', retryKind: 'none' });
    expect(financeExperienceFailureDetails(new Error('private filename and amount 23456'))).toEqual(
      { errorCategory: 'storage', retryKind: 'automatic' },
    );
    const sink = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    emitFinanceExperienceEvent({
      operation: 'query',
      outcome: 'failed',
      correlationId: 'safe-1',
      durationMs: 5,
      ...financeExperienceFailureDetails(new Error('private filename and amount 23456')),
    });
    expect(JSON.stringify(sink.mock.calls)).not.toContain('23456');
    expect(JSON.stringify(sink.mock.calls)).toContain('FinanceImportFailures');
  });

  it('routes an actual projection invariant failure to the existing integrity alarm series', async () => {
    const f = financePersistenceFixture();
    const fact = createFinanceFact(buildExperienceFixture().transactions[4]!, {});
    const key = { PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' };
    f.rows.set(f.key(key), { ...key, amountMinor: 0, currencyExponent: 1 });
    const sink = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    await expect(service.publish(fact)).rejects.toThrow(/invariant/i);
    const lines = sink.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines.find((line) => line.operation === 'finance.projection')).toMatchObject({
      errorCategory: 'invariant',
      outcome: 'failed',
    });
    expect(lines.find((line) => line.FinanceDataIntegrityFailures === 1)).toBeTruthy();
    expect(JSON.stringify(lines)).not.toContain(fact.accountId);
    expect(JSON.stringify(lines)).not.toContain(fact.description);
    const overflow = financePersistenceFixture();
    overflow.rows.set(overflow.key(key), {
      ...key,
      amountMinor: Number.MAX_SAFE_INTEGER,
      currencyExponent: 2,
    });
    sink.mockClear();
    const overflowService = new SpendProjectionService(
      () => new FinanceUnitOfWork(overflow.persistence, 'table'),
    );
    await expect(overflowService.publish(fact)).rejects.toThrow();
    expect(
      sink.mock.calls.some(([line]) => JSON.parse(String(line)).FinanceDataIntegrityFailures === 1),
    ).toBe(true);
  });

  it('detects a competing stalled publication using durable age and emits a bounded lag bucket', async () => {
    const f = financePersistenceFixture();
    const fact = createFinanceFact(buildExperienceFixture().transactions[4]!, {});
    const key = { PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' };
    f.rows.set(f.key(key), {
      ...key,
      state: 'rebuilding',
      operation: 'another-publication',
      revision: 1,
      startedAt: Date.now() - 16 * 60_000,
    });
    const sink = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    await expect(service.publish(fact)).rejects.toThrow(/stalled/i);
    const lines = sink.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines.find((line) => line.operation === 'finance.projection')).toMatchObject({
      errorCategory: 'stalled',
      projectionLagBucket: '>=15m',
      outcome: 'failed',
      retryKind: 'automatic',
    });
    expect(lines.find((line) => line.FinanceImportFailures === 1)).toBeTruthy();
    expect(JSON.stringify(lines)).not.toContain('startedAt');
    expect(f.writes).toBe(0);
  });

  it('redacts whole revision vectors, refund allocation payloads and original calendar context', () => {
    expect(
      redact({
        context: {
          sourceRevisions: { 'private-source': 'revision-7' },
          refundedAllocations: [{ id: 'private-allocation' }],
          entryContext: {
            enteredAt: 'private-instant',
            localDate: 'private-day',
            timeZone: 'private-zone',
          },
        },
      }),
    ).toEqual({
      context: {
        sourceRevisions: '[REDACTED]',
        refundedAllocations: '[REDACTED]',
        entryContext: '[REDACTED]',
      },
    });
  });
});
