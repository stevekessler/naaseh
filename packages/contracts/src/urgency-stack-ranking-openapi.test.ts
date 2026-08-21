import { describe, expect, it } from 'vitest';
import { pushRequestSchema } from './openapi.js';
import {
  reorderRequestSchema,
  stackPageSchema,
  urgencyCountsSchema,
  urgencyStackPushRequestSchema,
} from './urgency-stack-ranking-openapi.js';

const workId = '01J00000000000000000000001';
const mutationId = '01J00000000000000000000002';
const operationId = '01J00000000000000000000003';

const stackMutation = {
  id: mutationId,
  entityId: operationId,
  entityType: 'personalStackOperation' as const,
  operation: 'reorder' as const,
  baseVersion: 2,
  payload: {
    scope: 'overall' as const,
    baseVersion: 2,
    move: {
      kind: 'simple_move' as const,
      movedWork: { workType: 'task' as const, workId, membershipEpoch: 'epoch-1' },
    },
  },
  createdAt: '2026-08-05T12:00:00.000Z',
  attempts: 0,
};

describe('urgency and personal stack contracts', () => {
  it('requires a zero-fillable count for every categorical urgency', () => {
    expect(urgencyCountsSchema.parse({ low: 1, medium: 2, high: 3, critical: 4 })).toEqual({
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    });
    expect(urgencyCountsSchema.safeParse({ low: 1 }).success).toBe(false);
    expect(
      urgencyCountsSchema.safeParse({
        extra_low: 0,
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
      }).success,
    ).toBe(false);
  });

  it('validates discriminated reorder moves and Project page identity', () => {
    expect(reorderRequestSchema.parse(stackMutation.payload).move.kind).toBe('simple_move');
    expect(
      stackPageSchema.safeParse({
        scope: 'project',
        version: 1,
        snapshotThroughVersion: 1,
        asOf: '2026-08-05T12:00:00.000Z',
        items: [],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });

  it('accepts stack mutations only under sync contract version 4', () => {
    expect(
      urgencyStackPushRequestSchema.parse({ contractVersion: 4, mutations: [stackMutation] })
        .contractVersion,
    ).toBe(4);
    expect(
      pushRequestSchema.safeParse({ contractVersion: 4, mutations: [stackMutation] }).success,
    ).toBe(true);
    expect(
      pushRequestSchema.safeParse({ contractVersion: 3, mutations: [stackMutation] }).success,
    ).toBe(false);
  });
});
