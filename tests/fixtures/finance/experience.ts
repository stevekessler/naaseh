import {
  createBalancedAllocations,
  createBudget,
  createFinancialAccount,
  createMerchant,
  type BudgetItem,
  createFinancialTaskLink,
  createFinancialTransaction,
  createUserFinanceCategory,
  type FinancialAccount,
  type FinancialTransaction,
} from '@naaseh/domain';

/** Stable identifiers and original local dates keep concurrency/date fixtures reproducible. */
export const experienceId = (ordinal: number) => {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error('Invalid fixture ordinal.');
  return `01K${String(ordinal).padStart(23, '0')}`;
};

export const EXPERIENCE_NOW = '2026-10-31T18:00:00.000Z';
export const EXPERIENCE_GROUP_ID = experienceId(1);
export const EXPERIENCE_OTHER_GROUP_ID = experienceId(2);
export const EXPERIENCE_EMPTY_GROUP_ID = experienceId(3);

export const experienceActors = {
  owner: {
    id: 'experience-owner',
    role: 'user' as const,
    active: true,
    groupMemberships: [
      { groupId: EXPERIENCE_GROUP_ID, role: 'owner' as const },
      { groupId: EXPERIENCE_EMPTY_GROUP_ID, role: 'owner' as const },
    ],
  },
  member: {
    id: 'experience-member',
    role: 'user' as const,
    active: true,
    groupMemberships: [{ groupId: EXPERIENCE_GROUP_ID, role: 'member' as const }],
  },
  outsider: {
    id: 'experience-outsider',
    role: 'user' as const,
    active: true,
    groupMemberships: [],
  },
  administrator: {
    id: 'experience-admin',
    role: 'admin' as const,
    active: true,
    groupMemberships: [],
  },
  revoked: { id: 'experience-revoked', role: 'user' as const, active: true, groupMemberships: [] },
};

export function buildExperienceAccounts(): FinancialAccount[] {
  const types = ['checking', 'savings', 'credit-card', 'loan', 'other'] as const;
  return ([...types, 'checking', 'checking'] as const).map((accountType, index) =>
    createFinancialAccount({
      id: experienceId(100 + index),
      scope:
        index === 0
          ? { type: 'owner', ownerId: experienceActors.owner.id }
          : { type: 'group', groupId: EXPERIENCE_GROUP_ID },
      sourceName: `Synthetic ${accountType} ${index}`,
      organizationName: 'Synthetic Community Bank',
      accountType,
      currency: index === 6 ? 'EUR' : 'USD',
      openingBalanceMinor: 100_000,
      balanceAt: '2026-09-01T00:00:00.000Z',
      ...(index === 5 ? { connectionId: experienceId(900) } : {}),
    }),
  );
}

export function buildExperienceBudgets() {
  return [
    { label: 'Active', status: 'active' as const, activity: 'active' as const },
    { label: 'Inactive', status: 'active' as const, activity: 'inactive' as const },
    { label: 'Inactive and closed', status: 'active' as const, activity: 'inactive' as const },
    { label: 'Legacy draft', status: 'draft' as const, activity: 'inactive' as const },
    { label: 'Zero plan', status: 'active' as const, activity: 'active' as const },
    { label: 'Overspent', status: 'active' as const, activity: 'active' as const },
  ].map((definition, index) => ({
    ...createBudget({
      id: experienceId(200 + index),
      groupId: EXPERIENCE_GROUP_ID,
      name: definition.label,
      budgetDate: '2026-10-01',
      startDate: '2026-09-01',
      endDate: null,
      status: definition.status,
    }),
    activity: definition.activity,
    ...(index === 2 ? { closedAt: EXPERIENCE_NOW, closedBy: experienceActors.owner.id } : {}),
  }));
}

export function buildExperienceTransactions(): FinancialTransaction[] {
  const definitions = [
    { amount: -10_000, description: 'Original split purchase', at: '2026-09-30T18:00:00.000Z' },
    { amount: 2_500, description: 'Partial refund one', at: '2026-10-02T18:00:00.000Z' },
    { amount: 1_500, description: 'Partial refund two', at: '2026-10-03T18:00:00.000Z' },
    { amount: 50_000, description: 'Ordinary income', at: '2026-10-03T18:00:00.000Z' },
    { amount: -2_000, description: 'Posted expense', at: '2026-10-04T18:00:00.000Z' },
    {
      amount: -3_000,
      description: 'Pending expense',
      at: '2026-10-04T19:00:00.000Z',
      pending: true,
    },
    {
      amount: -4_000,
      description: 'Provisional observation',
      at: '2026-10-05T18:00:00.000Z',
      provisional: true,
    },
    {
      amount: -5_000,
      description: 'Transfer debit',
      at: '2026-10-06T18:00:00.000Z',
      transfer: true,
    },
    {
      amount: 5_000,
      description: 'Transfer credit',
      at: '2026-10-06T18:00:00.000Z',
      transfer: true,
    },
    { amount: -1_000, description: 'Euro expense', at: '2026-10-07T18:00:00.000Z', euro: true },
    { amount: -800, description: 'Local September boundary', at: '2026-10-01T05:30:00.000Z' },
  ];
  return definitions.map((definition, index) => {
    const transaction = createFinancialTransaction({
      id: experienceId(300 + index),
      accountId: experienceId(definition.euro ? 106 : definition.provisional ? 105 : 101),
      origin: 'manual',
      amountMinor: definition.amount,
      currency: definition.euro ? 'EUR' : 'USD',
      description: definition.description,
      transactedAt: definition.at,
      ...(!definition.pending && !definition.provisional ? { postedAt: definition.at } : {}),
      pending: definition.pending ?? false,
      connectedAccount: definition.provisional ?? false,
    });
    if (index === 0)
      transaction.allocations = createBalancedAllocations(
        -10_000,
        [
          {
            id: experienceId(400),
            amountMinor: -6_000,
            financeCategoryId: experienceId(500),
            budgetItemId: experienceId(600),
          },
          {
            id: experienceId(401),
            amountMinor: -4_000,
            financeCategoryId: experienceId(501),
            budgetItemId: experienceId(601),
          },
        ],
        experienceActors.owner.id,
        new Date(EXPERIENCE_NOW),
      );
    if (index === 4)
      transaction.allocations = createBalancedAllocations(
        -2_000,
        [
          {
            id: experienceId(402),
            amountMinor: -2_000,
            financeCategoryId: experienceId(500),
            budgetItemId: experienceId(602),
          },
        ],
        experienceActors.owner.id,
        new Date(EXPERIENCE_NOW),
      );
    if (definition.transfer) transaction.transferId = experienceId(700);
    return transaction;
  });
}

export function buildExperienceBudgetItems(): BudgetItem[] {
  return [
    {
      id: experienceId(600),
      budgetId: experienceId(200),
      financeCategoryId: experienceId(500),
      plannedAmountMinor: -6_000,
    },
    {
      id: experienceId(601),
      budgetId: experienceId(200),
      financeCategoryId: experienceId(501),
      plannedAmountMinor: -4_000,
    },
    {
      id: experienceId(602),
      budgetId: experienceId(205),
      financeCategoryId: experienceId(500),
      plannedAmountMinor: -1_000,
    },
  ].map((item) => ({
    ...item,
    description: 'Synthetic planned expense',
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: [experienceId(101)],
    creatorId: experienceActors.owner.id,
    status: 'active' as const,
    version: 1,
  }));
}

export function buildExperienceFixture() {
  return {
    actors: structuredClone(experienceActors),
    groups: [
      { id: EXPERIENCE_GROUP_ID, name: 'Synthetic household' },
      { id: EXPERIENCE_OTHER_GROUP_ID, name: 'Synthetic other group' },
      { id: EXPERIENCE_EMPTY_GROUP_ID, name: 'Synthetic group without Finance records' },
    ],
    merchant: createMerchant({
      id: experienceId(550),
      name: 'Synthetic Market',
      source: 'manual',
      creatorId: experienceActors.owner.id,
    }),
    budgetItems: buildExperienceBudgetItems(),
    accounts: buildExperienceAccounts(),
    budgets: buildExperienceBudgets(),
    transactions: buildExperienceTransactions(),
    categories: [
      createUserFinanceCategory({
        id: experienceId(500),
        name: 'Food',
        creatorId: experienceActors.owner.id,
      }),
      {
        ...createUserFinanceCategory({
          id: experienceId(501),
          name: 'Eating Out',
          creatorId: experienceActors.owner.id,
        }),
        parentId: experienceId(500),
      },
    ],
    refunds: [
      {
        id: experienceId(800),
        refundTransactionId: experienceId(301),
        originalExpenseTransactionId: experienceId(300),
        linkedAmountMinor: 2_500,
        currency: 'USD',
        allocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
      },
      {
        id: experienceId(801),
        refundTransactionId: experienceId(302),
        originalExpenseTransactionId: experienceId(300),
        linkedAmountMinor: 1_500,
        currency: 'USD',
        allocations: [{ originalAllocationId: experienceId(401), amountMinor: 1_500 }],
      },
    ],
    calendarCases: [
      {
        enteredAt: '2026-10-30T06:30:00.000Z',
        localDate: '2026-10-30',
        timeZone: 'UTC',
        dueDate: '2026-10-31',
        reconnectAt: '2026-11-02T18:00:00.000Z',
      },
      {
        enteredAt: '2026-10-30T05:30:00.000Z',
        localDate: '2026-10-29',
        timeZone: 'America/Denver',
        dueDate: '2026-10-30',
        reconnectAt: '2026-11-02T18:00:00.000Z',
      },
      {
        enteredAt: '2026-11-01T07:30:00.000Z',
        localDate: '2026-11-01',
        timeZone: 'America/Denver',
        dueDate: '2026-11-02',
        reconnectAt: '2026-11-03T18:00:00.000Z',
      },
    ],
    legacyTaskLink: createFinancialTaskLink({
      id: experienceId(950),
      budgetId: experienceId(200),
      budgetItemId: experienceId(600),
      taskId: experienceId(951),
      groupId: EXPERIENCE_GROUP_ID,
      createdBy: experienceActors.owner.id,
      now: new Date(EXPERIENCE_NOW),
    }),
    // Independent arithmetic oracle: October USD = 2000 expense - 4000 refunds.
    expectedSpend: { septemberUsd: 10_800, octoberUsd: -2_000, octoberEur: 1_000 },
    expectedRefundCapacity: {
      originalTotalMinor: 10_000,
      linkedMinor: 4_000,
      remainingMinor: 6_000,
    },
    expectedValidationGates: { firstResultsMs: 2_000, exactTotalsMs: 10_000, progressMs: 1_000 },
  };
}
