import { describe, expect, it } from 'vitest';
import {
  adaptLegacyFinancialTaskLink,
  createFinancialTaskLink,
  financialTaskLinkPairKey,
} from '@naaseh/domain';
import {
  financeLinkedTaskCreateSchema,
  financeTaskCreateInputSchema,
  financeTaskCreateResponseSchema,
  financeTaskLinkBatchQuerySchema,
  financeTaskLinkCreateSchema,
  financeTaskLinksReplaceSchema,
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
    expect(financialTaskLinkSchema.safeParse({ ...link, label: 'Private expense' }).success).toBe(
      false,
    );
    expect(financialTaskLinkSchema.safeParse({ ...link, targetType: 'receipt' }).success).toBe(
      false,
    );
    if (target.targetType === 'budgetItem') {
      expect(financialTaskLinkSchema.safeParse({ ...link, budgetId: undefined }).success).toBe(
        false,
      );
      expect(financialTaskLinkSchema.safeParse({ ...link, budgetItemId: id(99) }).success).toBe(
        false,
      );
    } else {
      expect(financialTaskLinkSchema.safeParse({ ...link, budgetId: id(3) }).success).toBe(false);
    }
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
      updatedAt: '2028-01-02T00:00:00.000Z',
      status: 'removed' as const,
      version: 2,
    };
    const adapted = adaptLegacyFinancialTaskLink(legacy);
    expect(adapted).toEqual({
      ...legacy,
      targetType: 'budgetItem',
      targetId: legacy.budgetItemId,
    });
    expect(financialTaskLinkSchema.parse(legacy)).toEqual(adapted);
    expect(financialTaskLinkSchema.parse(adapted)).toEqual(adapted);
  });

  it('defines unique task-target pairs while allowing several targets per task', () => {
    const key = financialTaskLinkPairKey(id(1), 'transaction', id(4));
    expect(key).toBe(`${id(1)}#transaction#${id(4)}`);
    expect(
      new Set([
        key,
        financialTaskLinkPairKey(id(2), 'transaction', id(4)),
        financialTaskLinkPairKey(id(1), 'upcomingExpense', id(4)),
        financialTaskLinkPairKey(id(1), 'transaction', id(5)),
      ]).size,
    ).toBe(4);
  });

  it('bounds deduplicated batch reads and create/edit selections to fifty targets', () => {
    const taskIds = Array.from({ length: 50 }, (_, index) => id(index + 100));
    expect(financeTaskLinkBatchQuerySchema.parse({ taskIds })).toEqual({ taskIds });
    expect(() =>
      financeTaskLinkBatchQuerySchema.parse({ taskIds: [...taskIds, id(999)] }),
    ).toThrow();
    expect(() => financeTaskLinkBatchQuerySchema.parse({ taskIds: [id(100), id(100)] })).toThrow();

    const selection = { targetType: 'transaction' as const, targetId: id(4) };
    const selections = [selection, { targetType: 'upcomingExpense', targetId: id(4) }];
    expect(financeTaskLinkCreateSchema.parse({ ...selection, expectedTaskVersion: 1 })).toEqual({
      ...selection,
      expectedTaskVersion: 1,
    });
    const task = { label: 'Review expenses', visibility: 'private', groupId: id(6) };
    const create = { task, financeLinkSelections: selections };
    const replace = { expectedTaskVersion: 1, financeLinkSelections: selections };
    const sourceCreate = {
      label: task.label,
      assigneeId: 'owner',
      financeLinkSelections: selections,
    };
    expect(financeLinkedTaskCreateSchema.parse(create).financeLinkSelections).toEqual(selections);
    expect(financeTaskLinksReplaceSchema.parse(replace)).toEqual(replace);
    expect(financeTaskCreateInputSchema.parse(sourceCreate)).toEqual(sourceCreate);

    const duplicates = { financeLinkSelections: [selection, selection] };
    expect(financeLinkedTaskCreateSchema.safeParse({ ...create, ...duplicates }).success).toBe(
      false,
    );
    expect(financeTaskLinksReplaceSchema.safeParse({ ...replace, ...duplicates }).success).toBe(
      false,
    );
    const maxSelections = taskIds.map((targetId) => ({ ...selection, targetId }));
    expect(
      financeTaskLinksReplaceSchema.parse({ ...replace, financeLinkSelections: maxSelections })
        .financeLinkSelections,
    ).toHaveLength(50);
    expect(
      financeTaskLinksReplaceSchema.safeParse({
        ...replace,
        financeLinkSelections: [...maxSelections, selection],
      }).success,
    ).toBe(false);
  });

  it('carries the saved task, applied links, and missing selections in a partial success receipt', () => {
    const pending = {
      taskId: id(1),
      linkStatus: 'pending',
      financialTaskLinkIds: [id(10)],
      pendingSelections: [{ targetType: 'upcomingExpense', targetId: id(5) }],
      retryToken: 'opaque-retry-token',
    };
    const applied = {
      taskId: pending.taskId,
      linkStatus: 'applied',
      financialTaskLinkIds: [...pending.financialTaskLinkIds, id(11)],
    };
    expect(financeTaskCreateResponseSchema.parse(pending)).toEqual(pending);
    expect(financeTaskCreateResponseSchema.parse(applied)).toEqual(applied);
    expect(
      financeTaskCreateResponseSchema.safeParse({ ...pending, retryToken: undefined }).success,
    ).toBe(false);
    expect(
      financeTaskCreateResponseSchema.safeParse({ ...pending, pendingSelections: [] }).success,
    ).toBe(false);
    expect(
      financeTaskCreateResponseSchema.safeParse({ ...applied, financialTaskLinkIds: [] }).success,
    ).toBe(false);
  });
});
