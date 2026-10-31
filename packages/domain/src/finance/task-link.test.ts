import { describe, expect, it } from 'vitest';
import {
  canRevealFinancialTaskLink,
  createFinancialTaskLink,
  removeFinancialTaskLink,
} from './task-link.js';

const ids = {
  link: '01J00000000000000000000801',
  budget: '01J00000000000000000000802',
  item: '01J00000000000000000000803',
  task: '01J00000000000000000000804',
  group: '01J00000000000000000000805',
};

describe('financial task links', () => {
  it('creates a Finance-audience relationship without financial values', () => {
    const link = createFinancialTaskLink({
      id: ids.link,
      budgetId: ids.budget,
      budgetItemId: ids.item,
      taskId: ids.task,
      groupId: ids.group,
      createdBy: 'member',
      now: new Date('2028-01-01T00:00:00.000Z'),
    });
    expect(link).toMatchObject({
      financeAudience: `GROUP#${ids.group}`,
      status: 'active',
      version: 1,
    });
    expect(JSON.stringify(link)).not.toMatch(/amount|merchant|description|label/iu);
  });

  it('requires independent task and Finance access before revealing the relationship', () => {
    const link = createFinancialTaskLink({
      id: ids.link,
      budgetId: ids.budget,
      budgetItemId: ids.item,
      taskId: ids.task,
      groupId: ids.group,
      createdBy: 'member',
    });
    expect(canRevealFinancialTaskLink({ link, canReadTask: true, canReadFinance: true })).toBe(
      true,
    );
    expect(canRevealFinancialTaskLink({ link, canReadTask: true, canReadFinance: false })).toBe(
      false,
    );
    expect(canRevealFinancialTaskLink({ link, canReadTask: false, canReadFinance: true })).toBe(
      false,
    );
  });

  it('removes a referenced relationship as an idempotent durable tombstone', () => {
    const link = createFinancialTaskLink({
      id: ids.link,
      budgetId: ids.budget,
      budgetItemId: ids.item,
      taskId: ids.task,
      groupId: ids.group,
      createdBy: 'member',
    });
    const removed = removeFinancialTaskLink(link, new Date('2028-01-02T00:00:00.000Z'));
    expect(removed).toMatchObject({ status: 'removed', version: 2 });
    expect(removeFinancialTaskLink(removed)).toBe(removed);
  });
});
