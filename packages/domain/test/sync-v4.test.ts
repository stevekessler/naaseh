import { describe, expect, it } from 'vitest';
import {
  contractV4MutationResultSchema,
  normalizeMutationResult,
  syncConflictEnvelopeSchema,
  syncRetryEnvelopeSchema,
} from '../src/index.js';

describe('sync contract version 4 response envelopes', () => {
  it('parses the stable mutation result shape strictly', () => {
    expect(
      contractV4MutationResultSchema.parse({
        mutationId: 'mutation-1',
        status: 'applied',
        version: 4,
        operationId: 'operation-1',
      }),
    ).toEqual({
      mutationId: 'mutation-1',
      status: 'applied',
      version: 4,
      operationId: 'operation-1',
    });
    expect(() =>
      contractV4MutationResultSchema.parse({
        mutationId: 'mutation-1',
        status: 'applied',
        entityVersion: 4,
      }),
    ).toThrow();
  });

  it('defines actionable retry and stack-conflict problems', () => {
    expect(
      syncRetryEnvelopeSchema.parse({
        code: 'stack_busy',
        message: 'Try this reorder again.',
        correlationId: 'request-1',
        retryAfterSeconds: 2,
      }).retryAfterSeconds,
    ).toBe(2);
    expect(
      syncConflictEnvelopeSchema.parse({
        code: 'stack_conflict',
        message: 'The stack changed.',
        correlationId: 'request-2',
        reason: 'anchor_removed',
        currentVersion: 9,
      }).reason,
    ).toBe('anchor_removed');
    expect(() =>
      syncConflictEnvelopeSchema.parse({
        code: 'stack_conflict',
        message: 'The stack changed.',
        correlationId: 'request-2',
        reason: 'last_write_wins',
        currentVersion: 9,
      }),
    ).toThrow();
  });

  it('normalizes supported older result fields without changing their status', () => {
    expect(
      normalizeMutationResult({
        mutationId: 'mutation-2',
        status: 'alreadyApplied',
        entityVersion: 7,
        entity: { id: 'task-1' },
      }),
    ).toEqual({ mutationId: 'mutation-2', status: 'alreadyApplied', version: 7 });
    expect(
      normalizeMutationResult({ mutationId: 'mutation-3', status: 'conflict', version: 8 }),
    ).toEqual({ mutationId: 'mutation-3', status: 'conflict', version: 8 });
  });
});
