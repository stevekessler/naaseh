import { createBudgetItem, type BudgetItem } from './budget.js';
import { currencyExponentFor } from './money.js';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export interface ReusableRecurrence {
  interval: number;
  unit: RecurrenceUnit;
  startDate: string;
  endDate?: string;
}

export interface ReusableBudgetItem {
  id: string;
  groupId: string;
  description: string;
  merchantId?: string;
  financeCategoryId: string;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent: number;
  relatedAccountIds: string[];
  applicableDate?: string;
  recurrence?: ReusableRecurrence;
  status: 'active' | 'archived' | 'tombstone';
  creatorId: string;
  version: number;
}

export interface CreateReusableBudgetItemInput {
  id: string;
  groupId: string;
  description: string;
  merchantId?: string;
  financeCategoryId: string;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent?: number;
  relatedAccountIds: readonly string[];
  applicableDate?: string;
  recurrence?: ReusableRecurrence;
  creatorId: string;
}

const calendarDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`${label} must be a calendar date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a calendar date.`);
  }
  return value;
};

const normalizedDescription = (value: string) => {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 300)
    throw new Error('Reusable item description must be 1–300 characters.');
  return normalized;
};

export function createReusableBudgetItem(input: CreateReusableBudgetItemInput): ReusableBudgetItem {
  if (!input.groupId || !input.financeCategoryId || !input.creatorId) {
    throw new Error('A reusable item requires a group, category, and creator.');
  }
  if (!Number.isSafeInteger(input.plannedAmountMinor) || input.plannedAmountMinor === 0) {
    throw new Error('A reusable planned amount must be a non-zero safe integer.');
  }
  const currencyExponent = currencyExponentFor(input.currency);
  if (input.currencyExponent !== undefined && input.currencyExponent !== currencyExponent) {
    throw new Error(`Currency exponent does not match ${input.currency}.`);
  }
  if (input.applicableDate && input.recurrence) {
    throw new Error('A reusable item chooses either one applicable date or a recurrence.');
  }
  const relatedAccountIds = [...new Set(input.relatedAccountIds)];
  if (
    relatedAccountIds.length !== input.relatedAccountIds.length ||
    relatedAccountIds.length > 50 ||
    relatedAccountIds.some((id) => !id)
  ) {
    throw new Error('Related account identifiers must be unique, non-empty, and bounded.');
  }
  let recurrence: ReusableRecurrence | undefined;
  if (input.recurrence) {
    if (
      !Number.isSafeInteger(input.recurrence.interval) ||
      input.recurrence.interval < 1 ||
      input.recurrence.interval > 366
    )
      throw new Error('Recurrence interval is invalid.');
    const startDate = calendarDate(input.recurrence.startDate, 'Recurrence start date');
    const endDate = input.recurrence.endDate
      ? calendarDate(input.recurrence.endDate, 'Recurrence end date')
      : undefined;
    if (endDate && endDate < startDate)
      throw new Error('Recurrence end date cannot precede its start date.');
    recurrence = { ...input.recurrence, startDate, ...(endDate ? { endDate } : {}) };
  }
  return {
    id: input.id,
    groupId: input.groupId,
    description: normalizedDescription(input.description),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    financeCategoryId: input.financeCategoryId,
    plannedAmountMinor: input.plannedAmountMinor,
    currency: input.currency,
    currencyExponent,
    relatedAccountIds,
    ...(input.applicableDate
      ? { applicableDate: calendarDate(input.applicableDate, 'Applicable date') }
      : {}),
    ...(recurrence ? { recurrence } : {}),
    status: 'active',
    creatorId: input.creatorId,
    version: 1,
  };
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Adds from the original anchor so a Jan 31 monthly recurrence resumes on Mar 31 after February. */
function recurrenceDate(anchor: Date, unit: RecurrenceUnit, amount: number) {
  if (unit === 'day' || unit === 'week') {
    return new Date(anchor.valueOf() + amount * (unit === 'week' ? 7 : 1) * 86_400_000);
  }
  const targetMonth = anchor.getUTCMonth() + amount * (unit === 'year' ? 12 : 1);
  const year = anchor.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

export function reusableOccurrenceDates(
  item: ReusableBudgetItem,
  period: { startDate: string; endDate: string | null },
  maximum = 400,
) {
  if (item.status !== 'active') return [];
  const startDate = calendarDate(period.startDate, 'Budget start date');
  const endDate =
    period.endDate === null ? '9999-12-31' : calendarDate(period.endDate, 'Budget end date');
  if (item.applicableDate)
    return item.applicableDate >= startDate && item.applicableDate <= endDate
      ? [item.applicableDate]
      : [];
  if (!item.recurrence) return [];
  const anchor = new Date(`${item.recurrence.startDate}T00:00:00.000Z`);
  const recurrenceEnd = item.recurrence.endDate ?? '9999-12-31';
  const occurrences: string[] = [];
  for (let index = 0; index < 20_000; index += 1) {
    const date = formatDate(
      recurrenceDate(anchor, item.recurrence.unit, index * item.recurrence.interval),
    );
    if (date > endDate || date > recurrenceEnd) break;
    if (date >= startDate) {
      occurrences.push(date);
      if (occurrences.length > maximum) throw new Error('Reusable occurrence limit exceeded.');
    }
  }
  return occurrences;
}

export function copyReusableBudgetItem(
  item: ReusableBudgetItem,
  input: { id: string; budgetId: string; creatorId: string; occurrenceDate: string },
): BudgetItem {
  if (item.status !== 'active') throw new Error('Only active reusable items can be copied.');
  return createBudgetItem({
    id: input.id,
    budgetId: input.budgetId,
    sourceReusableItemId: item.id,
    description: item.description,
    ...(item.merchantId ? { merchantId: item.merchantId } : {}),
    financeCategoryId: item.financeCategoryId,
    plannedAmountMinor: item.plannedAmountMinor,
    currency: item.currency,
    currencyExponent: item.currencyExponent,
    applicableDate: calendarDate(input.occurrenceDate, 'Occurrence date'),
    relatedAccountIds: [...item.relatedAccountIds],
    creatorId: input.creatorId,
  });
}

export function archiveReusableBudgetItem(item: ReusableBudgetItem): ReusableBudgetItem {
  if (item.status === 'tombstone') throw new Error('A reusable-item tombstone cannot be archived.');
  return item.status === 'archived'
    ? item
    : { ...item, status: 'archived', version: item.version + 1 };
}

export function tombstoneReusableBudgetItem(item: ReusableBudgetItem): ReusableBudgetItem {
  return item.status === 'tombstone'
    ? item
    : {
        ...item,
        description: 'Deleted reusable item',
        relatedAccountIds: [],
        status: 'tombstone',
        version: item.version + 1,
      };
}

export function canPermanentlyDeleteReusableBudgetItem(
  item: ReusableBudgetItem,
  impact: { hasReferences: boolean; isMistake: boolean },
) {
  return item.status === 'active' && !impact.hasReferences && impact.isMistake;
}
