import { describe, expect, it } from 'vitest';
import { createBudget, createBudgetItem } from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  authorizedFinancialTaskLinkForTask,
  createTaskFromFinanceBudgetItem,
} from '../../apps/api/src/finance/task-link-service.js';

const groupId = '01J00000000000000000000831';
const budgetId = '01J00000000000000000000832';
const itemId = '01J00000000000000000000833';
const taskId = '01J00000000000000000000834';

function setup() {
  const repository = new FinanceMemoryRepository();
  repository.budgets.set(
    budgetId,
    createBudget({
      id: budgetId,
      groupId,
      name: 'Private plan',
      budgetDate: '2028-02-01',
      startDate: '2028-02-01',
      status: 'active',
    }),
  );
  repository.budgetItems.set(
    itemId,
    createBudgetItem({
      id: itemId,
      budgetId,
      description: 'Protected utility',
      financeCategoryId: '01J00000000000000000000835',
      plannedAmountMinor: -12_345,
      currency: 'USD',
      relatedAccountIds: [],
      creatorId: 'member',
    }),
  );
  const member = {
    id: 'member',
    role: 'user' as const,
    active: true,
    groupMemberships: [{ groupId, role: 'member' as const }],
  };
  createTaskFromFinanceBudgetItem(
    repository,
    member,
    itemId,
    {
      taskId,
      linkId: '01J00000000000000000000836',
      label: 'Pay bill',
      assigneeId: 'member',
    },
    'security-task-link-1',
  );
  return { repository, member };
}

describe('Finance task-link isolation', () => {
  it('reveals no relationship or protected values to a task-only viewer', () => {
    const { repository } = setup();
    const taskOnlyViewer = {
      id: 'task-viewer',
      role: 'user' as const,
      active: true,
      groupMemberships: [],
    };
    expect(repository.tasks.get(taskId)?.visibility).toBe('public');
    expect(authorizedFinancialTaskLinkForTask(repository, taskOnlyViewer, taskId)).toBeUndefined();
    expect(JSON.stringify(repository.tasks.get(taskId))).not.toMatch(
      /Protected utility|12345|budgetItem/iu,
    );
  });

  it('removes the relationship immediately after Finance membership is revoked', () => {
    const { repository, member } = setup();
    expect(authorizedFinancialTaskLinkForTask(repository, member, taskId)).toBeDefined();
    expect(
      authorizedFinancialTaskLinkForTask(repository, { ...member, groupMemberships: [] }, taskId),
    ).toBeUndefined();
  });

  it('does not grant application administrators protected Finance access', () => {
    const { repository } = setup();
    expect(
      authorizedFinancialTaskLinkForTask(
        repository,
        {
          id: 'admin',
          role: 'admin',
          active: true,
          groupMemberships: [],
        },
        taskId,
      ),
    ).toBeUndefined();
  });
});
