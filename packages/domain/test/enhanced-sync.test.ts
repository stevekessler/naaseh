import { describe, expect, it } from 'vitest';
import {
  entityRevisionSchema,
  isSupportedEntityType,
  mutationOperationSchema,
  stableMutationStatusSchema,
} from '../src/index.js';

describe('enhanced synchronization domain contracts', () => {
  it('accepts every version-2 entity and rejects unknown entities', () => {
    for (const entity of [
      'task',
      'category',
      'group',
      'list',
      'listItem',
      'directoryItem',
      'attachment',
      'copyJob',
      'accessControl',
    ])
      expect(isSupportedEntityType(entity)).toBe(true);
    expect(isSupportedEntityType('fileBytes')).toBe(false);
  });

  it('supports semantic operations and stable retry outcomes', () => {
    expect(mutationOperationSchema.parse('resetOverrides')).toBe('resetOverrides');
    expect(mutationOperationSchema.parse('reorder')).toBe('reorder');
    expect(stableMutationStatusSchema.parse('alreadyApplied')).toBe('alreadyApplied');
    expect(stableMutationStatusSchema.parse('retry')).toBe('retry');
  });

  it('creates generic revisions without protected values', () => {
    expect(
      entityRevisionSchema.parse({
        id: '01J00000000000000000000000',
        entityType: 'listItem',
        entityId: '01J00000000000000000000001',
        actorId: 'owner',
        version: 2,
        changedAt: '2026-07-23T12:00:00.000Z',
        operation: 'update',
        changedFields: ['orderKey'],
        after: { orderKey: 'b' },
        syncOutcome: 'applied',
      }).entityType,
    ).toBe('listItem');
    expect(() =>
      entityRevisionSchema.parse({
        id: '01J00000000000000000000000',
        entityType: 'list',
        entityId: '01J00000000000000000000001',
        actorId: 'owner',
        version: 1,
        changedAt: '2026-07-23T12:00:00.000Z',
        operation: 'create',
        changedFields: ['name'],
        after: { name: { nested: 'protected' } },
      }),
    ).toThrow();
  });
});
