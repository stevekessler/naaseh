import { beforeEach, describe, expect, it, vi } from 'vitest';

const observability = vi.hoisted(() => ({ log: vi.fn(), metric: vi.fn() }));
vi.mock('@naaseh/observability', () => observability);

import {
  recordStackCompaction,
  recordStackOperation,
  stackAffectedCountBucket,
  stackCompactionTelemetry,
  stackOperationTelemetry,
} from '../../src/ranking/telemetry.js';

describe('personal stack telemetry', () => {
  beforeEach(() => {
    observability.log.mockClear();
    observability.metric.mockClear();
  });

  it('uses closed affected-count buckets and rejects invalid exact counts', () => {
    expect([0, 1, 2, 11, 101, 1_001, 10_001, 50_001].map(stackAffectedCountBucket)).toEqual([
      'zero',
      'one',
      'two_to_ten',
      'eleven_to_hundred',
      'hundred_one_to_thousand',
      'thousand_one_to_ten_thousand',
      'ten_thousand_one_to_fifty_thousand',
      'over_fifty_thousand',
    ]);
    expect(() => stackAffectedCountBucket(-1)).toThrow();
    expect(() => stackAffectedCountBucket(1.5)).toThrow();
  });

  it('drops protected identifiers, rank values, filters, and exact affected counts', () => {
    const detail = stackOperationTelemetry({
      correlationId: 'request-1',
      operationClass: 'reorder',
      scopeType: 'project',
      outcome: 'conflict',
      durationMs: 12.6,
      affectedCount: 37,
      moveKind: 'filtered_permutation',
      conflictReason: 'filter_basis_changed',
      userId: 'owner',
      projectId: 'project-secret',
      workIds: ['work-a', 'work-b'],
      rank: 1,
      urgency: 'critical',
      filterBasis: { urgency: ['critical'] },
    } as Parameters<typeof stackOperationTelemetry>[0] & Record<string, unknown>);

    expect(detail).toMatchObject({
      operation: 'ranking.stack_operation',
      correlationId: 'request-1',
      operationClass: 'reorder',
      scopeType: 'project',
      outcome: 'conflict',
      durationMs: 13,
      affectedCountBucket: 'eleven_to_hundred',
      moveKind: 'filtered_permutation',
      conflictReason: 'filter_basis_changed',
    });
    const rendered = JSON.stringify(detail);
    for (const protectedValue of ['owner', 'project-secret', 'work-a', 'critical'])
      expect(rendered).not.toContain(protectedValue);
    expect(detail).not.toHaveProperty('affectedCount');
  });

  it('emits aggregate reorder latency, conflict, and failure metrics without dimensions', () => {
    recordStackOperation({
      correlationId: 'request-2',
      operationClass: 'reorder',
      scopeType: 'overall',
      outcome: 'conflict',
      durationMs: 50,
      affectedCount: 2,
      moveKind: 'simple_move',
      conflictReason: 'version_mismatch',
    });

    expect(observability.metric.mock.calls).toEqual([
      ['StackOperationLatency', 50, 'Milliseconds'],
      ['StackReorders', 1],
      ['StackReorderConflicts', 1],
    ]);
    expect(observability.log).toHaveBeenCalledWith(
      'ranking.stack_operation',
      expect.not.objectContaining({ affectedCount: expect.anything() }),
    );
  });

  it('records compaction outcomes without logging item identities or exact volume', () => {
    const detail = stackCompactionTelemetry({
      correlationId: 'request-3',
      scopeType: 'project',
      outcome: 'failure',
      durationMs: 1_250,
      affectedCount: 50_000,
      failureClass: 'integrity',
    });
    expect(detail).toMatchObject({
      affectedCountBucket: 'ten_thousand_one_to_fifty_thousand',
      failureClass: 'integrity',
    });
    expect(detail).not.toHaveProperty('affectedCount');

    recordStackCompaction({
      correlationId: 'request-3',
      scopeType: 'project',
      outcome: 'failure',
      durationMs: 1_250,
      affectedCount: 50_000,
      failureClass: 'integrity',
    });
    expect(observability.metric.mock.calls).toEqual([
      ['StackCompactionLatency', 1_250, 'Milliseconds'],
      ['StackCompactions', 1],
      ['StackCompactionFailures', 1],
    ]);
  });
});
