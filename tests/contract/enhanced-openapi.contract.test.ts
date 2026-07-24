import { describe, expect, it } from 'vitest';
import {
  enhancedListContractVersion,
  enhancedMutationSchema,
  pushRequestSchema,
} from '@naaseh/contracts';

const mutation = {
  id: '01J00000000000000000000000',
  entityId: '01J00000000000000000000001',
  entityType: 'listItem' as const,
  operation: 'resetOverrides' as const,
  baseVersion: 1,
  payload: {},
  createdAt: '2026-07-23T12:00:00.000Z',
  attempts: 0,
};

describe('enhanced OpenAPI runtime schemas', () => {
  it('exports contract version 2 and parses enhanced mutations', () => {
    expect(enhancedListContractVersion).toBe(2);
    expect(enhancedMutationSchema.parse(mutation).entityType).toBe('listItem');
  });

  it('keeps version-1 task batches valid while requiring version 2 for enhanced entities', () => {
    expect(
      pushRequestSchema.parse({
        contractVersion: 1,
        mutations: [{ ...mutation, entityType: 'task', operation: 'update' }],
      }).contractVersion,
    ).toBe(1);
    expect(() => pushRequestSchema.parse({ contractVersion: 1, mutations: [mutation] })).toThrow();
    expect(
      pushRequestSchema.parse({ contractVersion: 2, mutations: [mutation] }).contractVersion,
    ).toBe(2);
  });
});
