import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  financeSyncEntitySchema,
  financeTaskCreateInputSchema,
  financeTaskCreateResponseSchema,
  financialTaskLinkSchema,
} from '@naaseh/contracts';

const ids = {
  task: '01J00000000000000000000811',
  link: '01J00000000000000000000812',
  budget: '01J00000000000000000000813',
  item: '01J00000000000000000000814',
  group: '01J00000000000000000000815',
};

describe('Finance task-link contract', () => {
  it('documents atomic creation, safe replay, not-found, and conflict responses', () => {
    const contract = readFileSync(
      'specs/015-finance-budget-management/contracts/finance.openapi.yaml',
      'utf8',
    );
    const operation = contract.slice(
      contract.indexOf('/finance/budget-items/{budgetItemId}/tasks:'),
      contract.indexOf('\ncomponents:'),
    );
    expect(operation).toContain('operationId: createTaskFromBudgetItem');
    expect(operation).toContain("'200':");
    expect(operation).toContain("'201':");
    expect(operation).toContain("'404':");
    expect(operation).toContain("'409':");
    expect(operation).toContain('additionalProperties: false');
  });

  it('accepts the bounded create request and redacted response', () => {
    expect(
      financeTaskCreateInputSchema.parse({
        label: 'Pay utility bill',
        assigneeId: 'member',
        dueDate: '2028-01-15',
      }),
    ).toMatchObject({ label: 'Pay utility bill' });
    expect(
      financeTaskCreateResponseSchema.parse({
        taskId: ids.task,
        financialTaskLinkId: ids.link,
      }),
    ).toEqual({ taskId: ids.task, financialTaskLinkId: ids.link });
    expect(() =>
      financeTaskCreateResponseSchema.parse({
        taskId: ids.task,
        financialTaskLinkId: ids.link,
        amountMinor: -10_000,
      }),
    ).toThrow();
  });

  it('keeps Finance links on the Finance sync entity without protected item values', () => {
    const link = financialTaskLinkSchema.parse({
      id: ids.link,
      budgetId: ids.budget,
      budgetItemId: ids.item,
      taskId: ids.task,
      financeAudience: `GROUP#${ids.group}`,
      createdBy: 'member',
      createdAt: '2028-01-01T00:00:00.000Z',
      updatedAt: '2028-01-01T00:00:00.000Z',
      status: 'active',
      version: 1,
    });
    expect(financeSyncEntitySchema.parse({ ...link, entityType: 'financeTaskLink' })).toMatchObject(
      {
        entityType: 'financeTaskLink',
        taskId: ids.task,
      },
    );
    expect(JSON.stringify(link)).not.toMatch(/amount|merchant|description|label/iu);
  });
});
