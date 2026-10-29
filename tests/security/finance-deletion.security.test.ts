import { describe, expect, it } from 'vitest';
import {
  createAuthorizedDeletionPreview,
  createDeletionPreview,
  executeDeletion,
} from '../../apps/api/src/finance/deletion-service.js';

describe('Finance deletion security', () => {
  it('does not disclose hidden dependents and preserves categories when deleting transactions', () => {
    const preview = createDeletionPreview({
      recordType: 'transaction',
      recordId: '01J00000000000000000000001',
      expectedVersion: 1,
      visibleDependentCounts: { allocations: 2 },
      hasReferences: true,
      isMistake: false,
      now: new Date('2026-01-01T00:00:00.000Z'),
      signingSecret: 'test-secret',
    });
    expect(preview).not.toHaveProperty('hiddenDependentCount');
    expect(preview.preservedRecordTypes).toContain('category');
    expect(
      executeDeletion(
        preview,
        { expectedVersion: 1, confirmationToken: preview.confirmationToken },
        new Date('2026-01-01T00:01:00.000Z'),
        'test-secret',
      ).outcome,
    ).toBe('archive');
  });

  it('permits permanent deletion only for an unreferenced mistake', () => {
    const preview = createDeletionPreview({
      recordType: 'account',
      recordId: '01J00000000000000000000001',
      expectedVersion: 1,
      visibleDependentCounts: {},
      hasReferences: false,
      isMistake: true,
      now: new Date('2026-01-01T00:00:00.000Z'),
      signingSecret: 'test-secret',
    });
    expect(preview.outcome).toBe('permanent-delete');
  });

  it('allows owner/manager previews, denies members generically, and includes only visible counts', () => {
    const scope = { type: 'group' as const, groupId: '01J00000000000000000000001' };
    const manager = {
      id: 'manager-1',
      role: 'user' as const,
      active: true,
      groupMemberships: [{ groupId: scope.groupId, role: 'manager' as const }],
    };
    expect(
      createAuthorizedDeletionPreview(manager, scope, {
        recordType: 'account',
        recordId: '01J00000000000000000000002',
        expectedVersion: 1,
        visibleDependentCounts: { transactions: 2 },
        hasReferences: true,
        isMistake: false,
        now: new Date('2026-01-01T00:00:00.000Z'),
        signingSecret: 'secret',
      }).dependentCounts,
    ).toEqual({ transactions: 2 });
    expect(() =>
      createAuthorizedDeletionPreview(
        { ...manager, groupMemberships: [{ groupId: scope.groupId, role: 'member' }] },
        scope,
        {
          recordType: 'account',
          recordId: '01J00000000000000000000002',
          expectedVersion: 1,
          visibleDependentCounts: {},
          hasReferences: false,
          isMistake: true,
          now: new Date('2026-01-01T00:00:00.000Z'),
          signingSecret: 'secret',
        },
      ),
    ).toThrow('Finance record not found.');
  });

  it.each(['account', 'transaction', 'budget', 'reusable-item', 'match', 'task-link'] as const)(
    'enforces group owner/manager authorization for %s deletion without hidden dependent disclosure',
    (recordType) => {
      const scope = { type: 'group' as const, groupId: 'group-1' };
      const manager = {
        id: 'manager-1',
        role: 'user' as const,
        active: true,
        groupMemberships: [{ groupId: scope.groupId, role: 'manager' as const }],
      };
      const input = {
        recordType,
        recordId: `${recordType}-1`,
        expectedVersion: 1,
        visibleDependentCounts: { visible: 2 },
        hasReferences: true,
        isMistake: false,
        now: new Date('2026-01-01T00:00:00.000Z'),
        signingSecret: 'secret',
      };
      const preview = createAuthorizedDeletionPreview(manager, scope, input);
      expect(preview.dependentCounts).toEqual({ visible: 2 });
      expect(preview).not.toHaveProperty('totalDependentCount');
      expect(() =>
        createAuthorizedDeletionPreview(
          { ...manager, groupMemberships: [{ groupId: scope.groupId, role: 'member' as const }] },
          scope,
          input,
        ),
      ).toThrow('Finance record not found.');
    },
  );

  it.each(['merchant', 'category'] as const)(
    'archives referenced global %s identities and preserves historical meaning',
    (recordType) => {
      const preview = createDeletionPreview({
        recordType,
        recordId: `${recordType}-1`,
        expectedVersion: 1,
        visibleDependentCounts: {},
        hasReferences: true,
        isMistake: false,
        now: new Date('2026-01-01T00:00:00.000Z'),
        signingSecret: 'secret',
      });
      expect(preview.outcome).toBe('archive');
      expect(preview.preservedRecordTypes[0]).toMatch(/historical/u);
    },
  );
});
