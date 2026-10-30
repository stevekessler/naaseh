import { describe, expect, it } from 'vitest';
import {
  authorizeFinanceScope,
  financeNotFound,
  type FinanceActor,
} from '../../apps/api/src/finance/authorization.js';

const owner: FinanceActor = {
  id: 'owner-1',
  role: 'user',
  active: true,
  groupMemberships: [],
};

describe('Finance authorization boundaries', () => {
  it('authorizes only the owner for an owner scope, including administrators', () => {
    const scope = { type: 'owner' as const, ownerId: owner.id };
    expect(authorizeFinanceScope(owner, scope, 'read').allowed).toBe(true);
    expect(
      authorizeFinanceScope({ ...owner, id: 'admin-1', role: 'admin' }, scope, 'read').allowed,
    ).toBe(false);
  });

  it('distinguishes active members from owners/managers for destructive group actions', () => {
    const scope = { type: 'group' as const, groupId: '01J00000000000000000000001' };
    const member = {
      ...owner,
      groupMemberships: [{ groupId: scope.groupId, role: 'member' as const }],
    };
    const manager = {
      ...owner,
      groupMemberships: [{ groupId: scope.groupId, role: 'manager' as const }],
    };
    expect(authorizeFinanceScope(member, scope, 'edit').allowed).toBe(true);
    expect(authorizeFinanceScope(member, scope, 'delete').allowed).toBe(false);
    expect(authorizeFinanceScope(manager, scope, 'delete').allowed).toBe(true);
  });

  it('maps inaccessible protected resources to one generic not-found problem', () => {
    expect(financeNotFound('fixture-correlation')).toEqual({
      status: 404,
      code: 'FINANCE_NOT_FOUND',
      message: 'Finance record not found.',
      correlationId: 'fixture-correlation',
    });
  });
});

it('applies ownership and group permissions equally to administrators for every action', () => {
  const administrator: FinanceActor = { ...owner, role: 'admin' };
  const groupId = '01J00000000000000000000001';
  const groupScope = { type: 'group' as const, groupId };
  for (const action of ['read', 'edit', 'connect', 'reassign', 'delete'] as const) {
    expect(
      authorizeFinanceScope(administrator, { type: 'owner', ownerId: owner.id }, action).allowed,
    ).toBe(true);
    expect(
      authorizeFinanceScope(administrator, { type: 'owner', ownerId: 'someone-else' }, action)
        .allowed,
    ).toBe(false);
    expect(authorizeFinanceScope(administrator, groupScope, action).allowed).toBe(false);
    for (const role of ['member', 'manager', 'owner'] as const) {
      const member = { ...administrator, groupMemberships: [{ groupId, role }] };
      expect(authorizeFinanceScope(member, groupScope, action).allowed).toBe(
        role !== 'member' || action === 'read' || action === 'edit',
      );
      expect(authorizeFinanceScope({ ...member, active: false }, groupScope, action).allowed).toBe(
        false,
      );
    }
    expect(
      authorizeFinanceScope(
        { ...administrator, active: false },
        { type: 'owner', ownerId: owner.id },
        action,
      ).allowed,
    ).toBe(false);
  }
});
