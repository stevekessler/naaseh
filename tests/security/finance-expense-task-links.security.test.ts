import { describe, expect, it } from 'vitest';
import { createFinancialAccount, createFinancialTransaction, createTask } from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  authorizedFinancialTaskLinksForTask,
  authorizedTasksForFinancialTarget,
  createAuthorizedFinancialTaskLink,
} from '../../apps/api/src/finance/task-link-service.js';

const id = (ordinal: number) => `01J${String(ordinal).padStart(23, '0')}`;

describe('Finance expense task-link access intersection', () => {
  it('does not reveal a private-account link, count, id, or target through a shared task', () => {
    const repository = new FinanceMemoryRepository();
    const owner = { id: 'owner', role: 'user' as const, active: true, groupMemberships: [] };
    repository.accounts.set(id(1), createFinancialAccount({
      id: id(1), scope: { type: 'owner', ownerId: owner.id }, sourceName: 'Private',
      organizationName: 'Manual', accountType: 'checking', currency: 'USD',
      openingBalanceMinor: 1000, balanceAt: '2028-01-01T00:00:00.000Z',
    }));
    repository.transactions.push(createFinancialTransaction({
      id: id(2), accountId: id(1), origin: 'manual', amountMinor: -100, currency: 'USD',
      transactedAt: '2028-01-01T00:00:00.000Z', description: 'Secret merchant', pending: false,
      connectedAccount: false,
    }));
    const task = { ...createTask({ label: 'Generic review', visibility: 'public' }, owner.id), id: id(3) };
    repository.tasks.set(task.id, task);
    createAuthorizedFinancialTaskLink(
      repository, owner, task.id, { targetType: 'transaction', targetId: id(2) }, id(4), 1,
    );
    const taskOnly = { id: 'viewer', role: 'user' as const, active: true, groupMemberships: [] };
    expect(authorizedFinancialTaskLinksForTask(repository, taskOnly, task.id)).toEqual([]);
    expect(authorizedTasksForFinancialTarget(repository, taskOnly, {
      targetType: 'transaction', targetId: id(2),
    })).toEqual([]);
    const ordinarySerialization = JSON.stringify(repository.tasks.get(task.id));
    expect(ordinarySerialization).not.toMatch(/Secret merchant|transaction|01J00000000000000000000002/iu);
  });

  it('requires task ownership as well as current financial edit access to create a link', () => {
    const repository = new FinanceMemoryRepository();
    const owner = { id: 'owner', role: 'user' as const, active: true, groupMemberships: [] };
    repository.accounts.set(id(1), createFinancialAccount({
      id: id(1), scope: { type: 'owner', ownerId: owner.id }, sourceName: 'Private',
      organizationName: 'Manual', accountType: 'checking', currency: 'USD',
      openingBalanceMinor: 1000, balanceAt: '2028-01-01T00:00:00.000Z',
    }));
    repository.transactions.push(createFinancialTransaction({
      id: id(2), accountId: id(1), origin: 'manual', amountMinor: -100, currency: 'USD',
      transactedAt: '2028-01-01T00:00:00.000Z', description: 'Secret', pending: false,
      connectedAccount: false,
    }));
    const task = { ...createTask({ label: 'Shared', visibility: 'public' }, owner.id), id: id(3) };
    repository.tasks.set(task.id, task);
    expect(() => createAuthorizedFinancialTaskLink(
      repository,
      { id: 'viewer', role: 'admin', active: true, groupMemberships: [] },
      task.id, { targetType: 'transaction', targetId: id(2) }, id(4), 1,
    )).toThrow('Finance record not found');
    expect(repository.financialTaskLinks.size).toBe(0);
  });
});
