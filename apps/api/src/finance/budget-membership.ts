import type { BudgetItem, TransactionAllocationInput } from '@naaseh/domain';
import type { FinanceMemoryRepository } from './repository.js';

export function itemBudgetIds(repository: FinanceMemoryRepository, item: BudgetItem): string[] {
  return [
    ...new Set([
      item.budgetId,
      ...[...repository.budgetItemMemberships.values()]
        .filter((link) => link.budgetItemId === item.id)
        .map((link) => link.budgetId),
    ]),
  ];
}
export function itemsForBudget(
  repository: FinanceMemoryRepository,
  budgetId: string,
): BudgetItem[] {
  return [...repository.budgetItems.values()]
    .filter((item) => itemBudgetIds(repository, item).includes(budgetId))
    .map((item) => ({ ...item, budgetId }));
}
export function allocationBudgetId(
  repository: FinanceMemoryRepository,
  allocation: Pick<TransactionAllocationInput, 'budgetId' | 'budgetItemId'>,
): string | undefined {
  return (
    allocation.budgetId ??
    (allocation.budgetItemId
      ? repository.budgetItems.get(allocation.budgetItemId)?.budgetId
      : undefined)
  );
}
