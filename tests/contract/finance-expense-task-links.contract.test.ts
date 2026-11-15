import { describe, expect, it } from 'vitest';
import {
  adaptLegacyFinancialTaskLink,
  createFinancialTaskLink,
  financialTaskLinkPairKey,
} from '@naaseh/domain';
import {
  financeTaskCreateInputSchema,
  financeTaskCreateResponseSchema,
  financeTaskLinkBatchQuerySchema,
  financeTaskLinkCreateSchema,
  financialTaskLinkSchema,
} from '@naaseh/contracts';

const id = (ordinal: number) => `01J${String(ordinal).padStart(23, '0')}`;

describe('Finance expense task-link v2 contract', () => {
  it.each([
    { targetType: 'budgetItem' as const, targetId: id(2), budgetId: id(3) },
    { targetType: 'transaction' as const, targetId: id(4) },
    { targetType: 'upcomingExpense' as const, targetId: id(5) },
  ])('accepts the $targetType target without protected display metadata', (target) => {
    const link = createFinancialTaskLink({
      id: id(10),
      taskId: id(1),
      target,
      financeAudience: `OWNER#owner`,
      createdBy: 'owner',
      now: new Date('2028-01-01T00:00:00.000Z'),
    });
    expect(financialTaskLinkSchema.parse(link)).toEqual(link);
    expect(link).toMatchObject(target);
    expect(JSON.stringify(link)).not.toMatch(/amount|merchant|description|label/iu);
  });

  it('adapts a legacy budget-item row without changing its link or target identity', () => {
    const legacy = {
      id: id(10),
      budgetId: id(3),
      budgetItemId: id(2),
      taskId: id(1),
      financeAudience: `GROUP#${id(6)}`,
      createdBy: 'owner',
      createdAt: '2028-01-01T00:00:00.000Z',
      updatedAt: '2028-01-01T00:00:00.000Z',
      status: 'active' as const,
      version: 1,
    };
    const adapted = adaptLegacyFinancialTaskLink(legacy);
    expect(adapted).toMatchObject({
      id: legacy.id,
      taskId: legacy.taskId,
      targetType: 'budgetItem',
      targetId: legacy.budgetItemId,
      budgetId: legacy.budgetId,
      createdAt: legacy.createdAt,
      version: 1,
    });
    expect(financialTaskLinkSchema.parse(legacy)).toEqual(adapted);
  });

  it('defines unique task-target pairs while allowing several targets per task', () => {
    expect(financialTaskLinkPairKey(id(1), 'transaction', id(4))).toBe(
      `${id(1)}#transaction#${id(4)}`,
    );
    expect(financialTaskLinkPairKey(id(1), 'upcomingExpense', id(4))).not.toBe(
      financialTaskLinkPairKey(id(1), 'transaction', id(4)),
    );
  });

  it('bounds deduplicated batch reads and create/edit selections to fifty targets', () => {
    const taskIds = Array.from({ length: 50 }, (_, index) => id(index + 100));
    expect(financeTaskLinkBatchQuerySchema.parse({ taskIds })).toEqual({ taskIds });
    expect(() => financeTaskLinkBatchQuerySchema.parse({ taskIds: [...taskIds, id(999)] })).toThrow();
    expect(() => financeTaskLinkBatchQuerySchema.parse({ taskIds: [id(100), id(100)] })).toThrow();

    const selection = { targetType: 'transaction' as const, targetId: id(4) };
    expect(financeTaskLinkCreateSchema.parse({ ...selection, expectedTaskVersion: 1 })).toEqual({
      ...selection,
      expectedTaskVersion: 1,
    });
    expect(
      financeTaskCreateInputSchema.parse({
        label: 'Review expenses',
        assigneeId: 'owner',
        financeLinkSelections: [selection, { targetType: 'upcomingExpense', targetId: id(5) }],
      }).financeLinkSelections,
    ).toHaveLength(2);
  });

  it('represents atomic success and idempotent partial-link retry without another task', () => {
    expect(
      financeTaskCreateResponseSchema.parse({
        taskId: id(1),
        linkStatus: 'applied',
        financialTaskLinkIds: [id(10), id(11)],
      }),
    ).toMatchObject({ linkStatus: 'applied', financialTaskLinkIds: [id(10), id(11)] });
    expect(
      financeTaskCreateResponseSchema.parse({
        taskId: id(1),
        linkStatus: 'pending',
        financialTaskLinkIds: [id(10)],
        pendingSelections: [{ targetType: 'upcomingExpense', targetId: id(5) }],
        retryToken: 'opaque-retry-token',
      }),
    ).toMatchObject({ taskId: id(1), linkStatus: 'pending', retryToken: 'opaque-retry-token' });
    expect(() =>
      financeTaskCreateResponseSchema.parse({
        taskId: id(1),
        linkStatus: 'pending',
        financialTaskLinkIds: [],
        pendingSelections: [{ targetType: 'transaction', targetId: id(4) }],
      }),
    ).toThrow();
  });
});
