import { describe, expect, it } from 'vitest';
import { deactivateBudget } from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  createUpcomingExpenseRecord,
  linkUpcomingExpenseFulfillment,
  rescheduleUpcomingExpenseRecord,
  unlinkUpcomingExpenseFulfillment,
  updateUpcomingExpenseRecord,
  reviewExpenseFulfillmentsForTransaction,
} from '../../apps/api/src/finance/upcoming-expense-service.js';
import {
  buildExpenseFulfillmentRemovalTransaction,
  buildExpenseFulfillmentTransaction,
  buildUpcomingExpenseCreateTransaction,
  buildUpcomingExpenseUpdateTransaction,
  reconcileFulfillmentTransactionAlias,
} from '../../apps/api/src/finance/upcoming-expense-repository.js';
import {
  buildExperienceFixture,
  experienceId,
  EXPERIENCE_GROUP_ID,
} from '../fixtures/finance/experience.js';

function setup() {
  const fixture = buildExperienceFixture();
  const repository = new FinanceMemoryRepository();
  for (const account of fixture.accounts) repository.accounts.set(account.id, account);
  for (const budget of fixture.budgets) repository.budgets.set(budget.id, budget);
  repository.transactions.push(...fixture.transactions);
  const account = fixture.accounts[1]!;
  const budget = fixture.budgets[0]!;
  const create = {
    id: experienceId(870),
    groupId: EXPERIENCE_GROUP_ID,
    accountId: account.id,
    budgetId: budget.id,
    description: 'Annual registration',
    expectedAmountMinor: 3_000,
    dueDate: '2026-11-02',
    entryContext: {
      enteredAt: '2026-10-31T18:00:00.000Z',
      localDate: '2026-10-31',
      timeZone: 'America/Denver',
    },
  };
  return { fixture, repository, account, budget, create };
}

describe('upcoming expense fulfillment service', () => {
  it('rejects a budget deactivated between offline entry and replay', () => {
    const { fixture, repository, budget, create } = setup();
    repository.budgets.set(
      budget.id,
      deactivateBudget(budget, fixture.actors.owner.id, new Date('2026-11-01T00:00:00.000Z')),
    );
    expect(() =>
      createUpcomingExpenseRecord(repository, fixture.actors.owner, create, 'late-create'),
    ).toThrow(/active|eligible/iu);
  });

  it('replays the exact create once and conflicts when the same mutation changes intent', () => {
    const { fixture, repository, create } = setup();
    const first = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'stable-create',
    );
    expect(
      createUpcomingExpenseRecord(repository, fixture.actors.owner, create, 'stable-create'),
    ).toEqual(first);
    expect(() =>
      createUpcomingExpenseRecord(
        repository,
        fixture.actors.owner,
        { ...create, expectedAmountMinor: create.expectedAmountMinor + 1 },
        'stable-create',
      ),
    ).toThrow(/mutation identity conflict/iu);
  });

  it('keeps an existing inactive-budget association manageable for reschedule and payment', () => {
    const { fixture, repository, budget, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'create-expense',
    );
    repository.budgets.set(budget.id, deactivateBudget(budget, fixture.actors.owner.id));
    const changed = rescheduleUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      created.expense.id,
      {
        dueDate: '2026-11-10',
        dateChangeContext: {
          enteredAt: '2026-11-01T18:00:00.000Z',
          localDate: '2026-11-01',
          timeZone: 'America/Denver',
        },
        expectedVersion: created.expense.version,
      },
      'reschedule-existing',
    );
    expect(changed.expense.dueDate).toBe('2026-11-10');

    const transaction = fixture.transactions[4]!;
    const linked = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      changed.expense.id,
      {
        id: experienceId(871),
        transactionId: transaction.id,
        amountMinor: 2_000,
        expectedExpenseVersion: changed.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'link-payment',
    );
    expect(linked).toMatchObject({ fulfilledAmountMinor: 2_000, remainingAmountMinor: 1_000 });
  });

  it('rejects reassignment to an inactive budget while leaving the original association intact', () => {
    const { fixture, repository, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'create-before-reassignment',
    );
    expect(() =>
      updateUpcomingExpenseRecord(
        repository,
        fixture.actors.owner,
        created.expense.id,
        {
          budgetId: fixture.budgets[1]!.id,
          expectedVersion: created.expense.version,
        },
        'inactive-reassignment',
      ),
    ).toThrow(/active|eligible/iu);
    expect(repository.upcomingExpenses.get(created.expense.id)?.budgetId).toBe(create.budgetId);
  });

  it('serializes competing claims and releases capacity on unlink', () => {
    const { fixture, repository, create } = setup();
    const firstExpense = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'create-first',
    );
    const secondExpense = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      { ...create, id: experienceId(872), description: 'Second obligation' },
      'create-second',
    );
    const transaction = fixture.transactions[4]!;
    const first = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      firstExpense.expense.id,
      {
        id: experienceId(873),
        transactionId: transaction.id,
        amountMinor: 1_500,
        expectedExpenseVersion: firstExpense.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'claim-first',
    );
    expect(() =>
      linkUpcomingExpenseFulfillment(
        repository,
        fixture.actors.owner,
        secondExpense.expense.id,
        {
          id: experienceId(874),
          transactionId: transaction.id,
          amountMinor: 500,
          expectedExpenseVersion: secondExpense.expense.version,
          expectedTransactionVersion: transaction.version,
          expectedClaimVersion: 0,
        },
        'stale-claim',
      ),
    ).toThrow(/claim.*version|conflict/iu);

    const removed = unlinkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      firstExpense.expense.id,
      first.fulfillments[0]!.id,
      {
        expectedExpenseVersion: first.expense.version,
        expectedFulfillmentVersion: first.fulfillments[0]!.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: first.claimVersion,
      },
      'unlink-first',
    );
    expect(removed.fulfilledAmountMinor).toBe(0);
    expect(removed.claimVersion).toBe(2);
    expect(
      unlinkUpcomingExpenseFulfillment(
        repository,
        fixture.actors.owner,
        firstExpense.expense.id,
        first.fulfillments[0]!.id,
        {
          expectedExpenseVersion: first.expense.version,
          expectedFulfillmentVersion: first.fulfillments[0]!.version,
          expectedTransactionVersion: transaction.version,
          expectedClaimVersion: first.claimVersion,
        },
        'unlink-first',
      ),
    ).toEqual(removed);
    expect(() =>
      unlinkUpcomingExpenseFulfillment(
        repository,
        fixture.actors.owner,
        firstExpense.expense.id,
        first.fulfillments[0]!.id,
        {
          expectedExpenseVersion: first.expense.version,
          expectedFulfillmentVersion: first.fulfillments[0]!.version,
          expectedTransactionVersion: transaction.version,
          expectedClaimVersion: first.claimVersion + 1,
        },
        'unlink-first',
      ),
    ).toThrow(/mutation identity conflict/iu);
  });

  it('moves fulfillment references and ledger versions to a provider canonical alias', () => {
    const { fixture, repository, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'alias-expense',
    );
    const transaction = fixture.transactions[4]!;
    const linked = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      created.expense.id,
      {
        id: experienceId(875),
        transactionId: transaction.id,
        amountMinor: 1_000,
        expectedExpenseVersion: created.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'alias-claim',
    );
    const canonicalId = experienceId(876);
    reconcileFulfillmentTransactionAlias(repository, transaction.id, canonicalId);
    expect(repository.expenseFulfillments.get(linked.fulfillments[0]!.id)).toMatchObject({
      transactionId: canonicalId,
      version: 2,
    });
    expect(repository.fulfillmentClaimVersions.get(canonicalId)).toBe(1);
    expect(repository.fulfillmentClaimVersions.has(transaction.id)).toBe(false);
  });

  it('removes paid contribution when a transaction correction invalidates claim capacity', () => {
    const { fixture, repository, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'correction-expense',
    );
    const transaction = fixture.transactions[4]!;
    const linked = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      created.expense.id,
      {
        id: experienceId(878),
        transactionId: transaction.id,
        amountMinor: 2_000,
        expectedExpenseVersion: created.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'correction-claim',
    );
    const index = repository.transactions.findIndex(({ id }) => id === transaction.id);
    repository.transactions[index] = { ...transaction, amountMinor: -1_000, version: 2 };
    reviewExpenseFulfillmentsForTransaction(repository, transaction.id);
    const reviewed = repository.expenseFulfillments.get(linked.fulfillments[0]!.id)!;
    expect(reviewed).toMatchObject({ calculationState: 'needs-review', version: 2 });
    expect(
      repository.upcomingExpenses.get(created.expense.id) &&
        repository.expenseFulfillments.get(reviewed.id)?.calculationState,
    ).toBe('needs-review');
  });

  it('builds bounded atomic create and claim writes with every required version fence', () => {
    const { fixture, repository, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'builder-create',
    );
    const createWrite = buildUpcomingExpenseCreateTransaction({
      expense: created.expense,
      mutationReceipt: {
        actorId: fixture.actors.owner.id,
        mutationId: 'builder-create',
        fingerprint: 'fingerprint',
      },
    });
    expect(createWrite.TransactItems).toHaveLength(5);
    expect(createWrite.TransactItems?.every((item) => 'Put' in item)).toBe(true);

    const transaction = fixture.transactions[4]!;
    const linked = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      created.expense.id,
      {
        id: experienceId(877),
        transactionId: transaction.id,
        amountMinor: 1_000,
        expectedExpenseVersion: created.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'builder-claim',
    );
    const claimWrite = buildExpenseFulfillmentTransaction({
      before: created.expense,
      after: linked.expense,
      fulfillment: linked.fulfillments[0]!,
      transactionStorageKey: { PK: 'ACCOUNT', SK: 'TRANSACTION' },
      expectedTransactionVersion: transaction.version,
      expectedClaimVersion: 0,
      claimedMinorAfter: 1_000,
    });
    expect(claimWrite.TransactItems).toHaveLength(5);
    expect(claimWrite.TransactItems?.some((item) => 'ConditionCheck' in item)).toBe(true);
    expect(
      claimWrite.TransactItems?.filter((item) => 'Put' in item).map(
        (item) => item.Put?.ConditionExpression,
      ),
    ).toContain('attribute_not_exists(PK)');
  });

  it('builds bounded version-fenced reschedule and fulfillment removal writes', () => {
    const { fixture, repository, create } = setup();
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      create,
      'builder-update-create',
    );
    const rescheduled = rescheduleUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      created.expense.id,
      {
        dueDate: '2026-11-12',
        dateChangeContext: {
          enteredAt: '2026-11-01T18:00:00.000Z',
          localDate: '2026-11-01',
          timeZone: 'America/Denver',
        },
        expectedVersion: created.expense.version,
      },
      'builder-reschedule',
    );
    const updateWrite = buildUpcomingExpenseUpdateTransaction({
      before: created.expense,
      after: rescheduled.expense,
      mutationReceipt: {
        actorId: fixture.actors.owner.id,
        mutationId: 'builder-reschedule',
        fingerprint: 'reschedule-fingerprint',
      },
    });
    expect(updateWrite.TransactItems).toHaveLength(7);
    expect(updateWrite.TransactItems?.filter((item) => 'Delete' in item)).toHaveLength(2);
    expect(updateWrite.TransactItems?.[0]?.Put?.ConditionExpression).toBe('#version = :expected');

    const transaction = fixture.transactions[4]!;
    const linked = linkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      rescheduled.expense.id,
      {
        id: experienceId(879),
        transactionId: transaction.id,
        amountMinor: 1_000,
        expectedExpenseVersion: rescheduled.expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
      'builder-remove-link',
    );
    const removed = unlinkUpcomingExpenseFulfillment(
      repository,
      fixture.actors.owner,
      linked.expense.id,
      linked.fulfillments[0]!.id,
      {
        expectedExpenseVersion: linked.expense.version,
        expectedFulfillmentVersion: linked.fulfillments[0]!.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: linked.claimVersion,
      },
      'builder-remove',
    );
    const removalWrite = buildExpenseFulfillmentRemovalTransaction({
      before: linked.expense,
      after: removed.expense,
      beforeFulfillment: linked.fulfillments[0]!,
      afterFulfillment: removed.fulfillments[0]!,
      transactionStorageKey: { PK: 'ACCOUNT', SK: 'TRANSACTION' },
      expectedTransactionVersion: transaction.version,
      expectedClaimVersion: linked.claimVersion,
      claimedMinorAfter: 0,
    });
    expect(removalWrite.TransactItems).toHaveLength(5);
    expect(removalWrite.TransactItems?.slice(0, 4)).toSatisfy((items: unknown[]) =>
      items.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          ('ConditionCheck' in item ||
            ('Put' in item &&
              typeof item.Put === 'object' &&
              item.Put !== null &&
              'ConditionExpression' in item.Put)),
      ),
    );
  });
});
