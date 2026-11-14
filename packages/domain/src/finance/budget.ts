import { currencyExponentFor } from './money.js';
import type { FinanceScope } from './scope.js';
import type { FinanceClassificationSnapshot } from './category.js';

export type BudgetStatus =
  | 'draft'
  | 'active'
  | 'changed-since-reconciliation'
  | 'archived'
  | 'tombstone';

export interface Budget {
  id: string;
  groupId: string;
  name: string;
  budgetDate: string;
  startDate: string;
  endDate: string | null;
  status: BudgetStatus;
  /** Missing only on records created before independent budget activity existed. */
  activity?: 'active' | 'inactive';
  activityChangedAt?: string;
  activityChangedBy?: string;
  closedAt?: string;
  closedBy?: string;
  lastReconciledAt?: string;
  version: number;
}

export interface CreateBudgetInput {
  id: string;
  groupId: string;
  name: string;
  budgetDate: string;
  startDate: string;
  endDate?: string | null;
  status?: 'draft' | 'active';
  activityChangedAt?: string;
  activityChangedBy?: string;
}

export interface BudgetAccountLink {
  id: string;
  budgetId: string;
  accountId: string;
  audience: FinanceScope;
  status: 'active' | 'removed';
  createdBy: string;
  version: number;
}

export interface CreateBudgetAccountLinkInput {
  id: string;
  budgetId: string;
  accountId: string;
  audience: FinanceScope;
  createdBy: string;
}

export interface BudgetItem {
  id: string;
  budgetId: string;
  sourceReusableItemId?: string;
  description: string;
  merchantId?: string;
  financeCategoryId: string;
  subcategoryId?: string;
  classification?: FinanceClassificationSnapshot;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent: number;
  applicableDate?: string;
  relatedAccountIds: string[];
  creatorId: string;
  lastReconciledAt?: string;
  status: 'active' | 'archived' | 'tombstone';
  version: number;
}

export interface CreateBudgetItemInput {
  id: string;
  budgetId: string;
  sourceReusableItemId?: string;
  description: string;
  merchantId?: string;
  financeCategoryId: string;
  subcategoryId?: string;
  classification?: FinanceClassificationSnapshot;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent?: number;
  applicableDate?: string;
  relatedAccountIds: readonly string[];
  creatorId: string;
}

const dateOnly = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`${label} must be a calendar date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a calendar date.`);
  }
  return value;
};

const requiredText = (value: string, label: string, maximum: number) => {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must be 1–${maximum} characters.`);
  }
  return normalized;
};

export function createBudget(input: CreateBudgetInput): Budget {
  const startDate = dateOnly(input.startDate, 'Budget start date');
  const endDate =
    input.endDate === undefined || input.endDate === null
      ? null
      : dateOnly(input.endDate, 'Budget end date');
  if (endDate !== null && endDate < startDate) {
    throw new Error('Budget end date cannot be before its start date.');
  }
  const status = input.status ?? 'draft';
  return {
    id: input.id,
    groupId: input.groupId,
    name: requiredText(input.name, 'Budget name', 200),
    budgetDate: dateOnly(input.budgetDate, 'Budget date'),
    startDate,
    endDate,
    status,
    activity: status === 'active' ? 'active' : 'inactive',
    ...(input.activityChangedAt ? { activityChangedAt: input.activityChangedAt } : {}),
    ...(input.activityChangedBy ? { activityChangedBy: input.activityChangedBy } : {}),
    version: 1,
  };
}

export function effectiveBudgetActivity(budget: Budget): 'active' | 'inactive' {
  if (budget.activity) return budget.activity;
  return budget.status === 'active' || budget.status === 'changed-since-reconciliation'
    ? 'active'
    : 'inactive';
}

const activityTimestamp = (value: Date) => {
  if (Number.isNaN(value.valueOf())) throw new Error('Budget activity time must be valid.');
  return value.toISOString();
};

export function deactivateBudget(budget: Budget, actorId: string, now = new Date()): Budget {
  if (!actorId) throw new Error('Budget activity requires an actor.');
  if (effectiveBudgetActivity(budget) === 'inactive') return budget;
  return {
    ...budget,
    activity: 'inactive',
    activityChangedAt: activityTimestamp(now),
    activityChangedBy: actorId,
    version: budget.version + 1,
  };
}

export function reactivateBudget(budget: Budget, actorId: string, now = new Date()): Budget {
  if (!actorId) throw new Error('Budget activity requires an actor.');
  if (budget.status === 'archived' || budget.status === 'tombstone') {
    throw new Error('An archived budget cannot be reactivated.');
  }
  if (effectiveBudgetActivity(budget) === 'active') return budget;
  return {
    ...budget,
    activity: 'active',
    activityChangedAt: activityTimestamp(now),
    activityChangedBy: actorId,
    version: budget.version + 1,
  };
}

export function closeBudget(budget: Budget, actorId: string, now = new Date()): Budget {
  if (!actorId) throw new Error('Budget closure requires an actor.');
  if (budget.closedAt) return budget;
  return {
    ...budget,
    closedAt: activityTimestamp(now),
    closedBy: actorId,
    version: budget.version + 1,
  };
}

export function reopenBudget(budget: Budget): Budget {
  if (!budget.closedAt) return budget;
  const updated = { ...budget, version: budget.version + 1 };
  delete updated.closedAt;
  delete updated.closedBy;
  return updated;
}

export function isBudgetEligibleForNewUpcoming(budget: Budget): boolean {
  return (
    effectiveBudgetActivity(budget) === 'active' &&
    (budget.status === 'active' || budget.status === 'changed-since-reconciliation') &&
    !budget.closedAt
  );
}

export function createBudgetAccountLink(input: CreateBudgetAccountLinkInput): BudgetAccountLink {
  if (!input.budgetId || !input.accountId)
    throw new Error('A budget account link requires a budget and account.');
  if (!input.createdBy) throw new Error('A budget account link requires its creator.');
  return { ...input, status: 'active', version: 1 };
}

export function removeBudgetAccountLink(link: BudgetAccountLink): BudgetAccountLink {
  if (link.status === 'removed') return link;
  return { ...link, status: 'removed', version: link.version + 1 };
}

export function createBudgetItem(input: CreateBudgetItemInput): BudgetItem {
  const currencyExponent = currencyExponentFor(input.currency);
  if (input.currencyExponent !== undefined && input.currencyExponent !== currencyExponent) {
    throw new Error(`Currency exponent does not match ${input.currency}.`);
  }
  if (!Number.isSafeInteger(input.plannedAmountMinor) || input.plannedAmountMinor === 0) {
    throw new Error('A planned amount must be a non-zero safe integer.');
  }
  if (!input.financeCategoryId) throw new Error('A budget item requires a Finance category.');
  if (!input.creatorId) throw new Error('A budget item requires its creator.');
  if (input.relatedAccountIds.length > 50)
    throw new Error('A budget item can relate to at most 50 accounts.');
  const relatedAccountIds = [...new Set(input.relatedAccountIds)];
  if (
    relatedAccountIds.length !== input.relatedAccountIds.length ||
    relatedAccountIds.some((id) => !id)
  ) {
    throw new Error('Related account identifiers must be unique and non-empty.');
  }
  return {
    id: input.id,
    budgetId: input.budgetId,
    ...(input.sourceReusableItemId ? { sourceReusableItemId: input.sourceReusableItemId } : {}),
    description: requiredText(input.description, 'Budget item description', 300),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    financeCategoryId: input.financeCategoryId,
    ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    plannedAmountMinor: input.plannedAmountMinor,
    currency: input.currency,
    currencyExponent,
    ...(input.applicableDate
      ? { applicableDate: dateOnly(input.applicableDate, 'Applicable date') }
      : {}),
    relatedAccountIds,
    creatorId: input.creatorId,
    status: 'active',
    version: 1,
  };
}

export function archiveBudget(budget: Budget): Budget {
  if (budget.status === 'tombstone') throw new Error('A budget tombstone cannot be archived.');
  if (budget.status === 'archived') return budget;
  return { ...budget, status: 'archived', version: budget.version + 1 };
}

export function tombstoneBudget(budget: Budget): Budget {
  if (budget.status === 'tombstone') return budget;
  return { ...budget, name: 'Deleted budget', status: 'tombstone', version: budget.version + 1 };
}

export function canPermanentlyDeleteBudget(
  budget: Budget,
  impact: { hasReferences: boolean; isMistake: boolean },
) {
  return budget.status === 'draft' && !impact.hasReferences && impact.isMistake;
}

export function archiveBudgetItem(item: BudgetItem): BudgetItem {
  if (item.status === 'tombstone') throw new Error('A budget item tombstone cannot be archived.');
  if (item.status === 'archived') return item;
  return { ...item, status: 'archived', version: item.version + 1 };
}

export function tombstoneBudgetItem(item: BudgetItem): BudgetItem {
  if (item.status === 'tombstone') return item;
  const tombstone: BudgetItem = {
    ...item,
    description: 'Deleted budget item',
    relatedAccountIds: [],
    status: 'tombstone',
    version: item.version + 1,
  };
  delete tombstone.merchantId;
  return tombstone;
}

export function canPermanentlyDeleteBudgetItem(
  item: BudgetItem,
  impact: { budgetStatus: BudgetStatus; hasReferences: boolean; isMistake: boolean },
) {
  return (
    item.status === 'active' &&
    impact.budgetStatus === 'draft' &&
    !impact.hasReferences &&
    impact.isMistake
  );
}
