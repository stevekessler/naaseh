import { useCallback, useEffect, useRef, useState } from 'react';
import { createUlid, createUpcomingExpense, type GroupView } from '@naaseh/domain';
import { listLocalGroups } from '../../../db/group-repository.js';
import { queueEncryptedUpcomingExpenseMutation } from '../../../db/finance-repository.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import { UpcomingExpenseDetail, type EligibleExpenseTransaction } from './UpcomingExpenseDetail.js';
import { UpcomingExpenseForm, type UpcomingExpenseFormValue } from './UpcomingExpenseForm.js';
import { UpcomingExpensesPage } from './UpcomingExpensesPage.js';
import type { UpcomingExpenseView } from './types.js';

interface WorkspaceAccount {
  id: string;
  friendlyName: string;
  currency: string;
  scope: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
}

interface WorkspaceBudget {
  id: string;
  name: string;
  groupId: string;
  status: 'draft' | 'active' | 'changed-since-reconciliation' | 'archived' | 'tombstone';
  activity?: 'active' | 'inactive';
  closedAt?: string;
}

interface WorkspaceTransaction extends EligibleExpenseTransaction {
  accountId: string;
  currency: string;
  status: 'active' | 'archived' | 'tombstone';
  transferId?: string;
}

interface UpcomingWorkspaceSnapshot {
  items: UpcomingExpenseView[];
  accounts: WorkspaceAccount[];
  budgets: WorkspaceBudget[];
  groups: GroupView[];
  transactions: WorkspaceTransaction[];
}

export function UpcomingExpensesWorkspace({
  ownerId,
  csrfToken,
  initialExpenseId,
  creating = false,
  initialAccountId,
  onCreate,
  onOpenExpense,
  onOpenAccount,
}: {
  ownerId: string;
  csrfToken: string;
  initialExpenseId?: string;
  creating?: boolean;
  initialAccountId?: string;
  onCreate: () => void;
  onOpenExpense: (expenseId: string) => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const [state, setState] = useState<UpcomingWorkspaceSnapshot>({
    items: [],
    accounts: [],
    budgets: [],
    groups: [],
    transactions: [],
  });
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retained = useRef<FinanceApiSnapshot<UpcomingWorkspaceSnapshot> | undefined>(undefined);
  const serial = useRef(0);

  const clear = useCallback(() => {
    serial.current++;
    if (retained.current) disposeFinanceApiSnapshot(retained.current);
    retained.current = undefined;
    setState({ items: [], accounts: [], budgets: [], groups: [], transactions: [] });
    setChecking(false);
    setError('Reconnect and refresh Finance to view upcoming expenses.');
    setNotice('');
  }, []);

  const refresh = useCallback(
    async (selectedId = initialExpenseId) => {
      const current = ++serial.current;
      setChecking(true);
      setError('');
      let next: FinanceApiSnapshot<UpcomingWorkspaceSnapshot> | undefined;
      try {
        next = await loadFinanceApiSnapshot(async (request) => {
          const [expensePage, accountPage, budgetPage, groups] = await Promise.all([
            request<{ items: UpcomingExpenseView[] }>(
              '/finance/upcoming-expenses?includeClosed=true',
            ),
            request<{ items: WorkspaceAccount[] }>('/finance/accounts'),
            request<{ items: WorkspaceBudget[] }>('/finance/budgets'),
            listLocalGroups(),
          ]);
          const selected = selectedId
            ? await request<UpcomingExpenseView>(
                `/finance/upcoming-expenses/${encodeURIComponent(selectedId)}`,
              )
            : undefined;
          const items = selected
            ? [
                ...expensePage.items.filter(({ expense }) => expense.id !== selected.expense.id),
                selected,
              ]
            : expensePage.items;
          const accountId = selected?.expense.accountId;
          const transactionPage = accountId
            ? await request<{ items: WorkspaceTransaction[] }>(
                `/finance/accounts/${encodeURIComponent(accountId)}/transactions`,
              )
            : { items: [] };
          return {
            items,
            accounts: accountPage.items,
            budgets: budgetPage.items,
            groups,
            transactions: transactionPage.items,
          };
        });
        const value = await readFinanceApiSnapshot(next, (value) => value);
        if (current !== serial.current) {
          disposeFinanceApiSnapshot(next);
          return false;
        }
        if (retained.current) disposeFinanceApiSnapshot(retained.current);
        retained.current = next;
        setState(value);
        setChecking(false);
        return true;
      } catch {
        if (next) disposeFinanceApiSnapshot(next);
        if (current === serial.current) clear();
        return false;
      }
    },
    [clear, initialExpenseId],
  );

  useEffect(() => {
    clear();
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    void refresh(initialExpenseId);
    return () => {
      unsubscribe?.();
      serial.current++;
      if (retained.current) disposeFinanceApiSnapshot(retained.current);
      retained.current = undefined;
    };
  }, [ownerId, initialExpenseId, clear, refresh]);

  const confirmCurrent = async () => {
    const snapshot = retained.current;
    if (!snapshot) return false;
    try {
      await readFinanceApiSnapshot(snapshot, () => true);
      return snapshot === retained.current;
    } catch {
      clear();
      return false;
    }
  };

  const mutate = async (path: string, method: string, body: unknown, selectedId: string) => {
    if (!(await confirmCurrent())) throw new Error('Finance access changed.');
    await financeRequest(path, {
      method,
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify(body),
    });
    if (!(await refresh(selectedId))) throw new Error('The saved expense could not be confirmed.');
    setNotice('Upcoming expense saved.');
  };

  const createExpense = async (value: UpcomingExpenseFormValue) => {
    const id = createUlid();
    const payload = { ...value, id };
    try {
      await mutate('/finance/upcoming-expenses', 'POST', payload, id);
      onOpenExpense(id);
    } catch (cause) {
      if (navigator.onLine) throw cause;
      if (!(await confirmCurrent())) throw cause;
      const account = state.accounts.find(({ id: accountId }) => accountId === value.accountId);
      if (!account) throw cause;
      const expense = createUpcomingExpense({
        ...payload,
        currency: account.currency,
        creatorId: ownerId,
        acceptedAt: value.entryContext.enteredAt,
      });
      await queueEncryptedUpcomingExpenseMutation({
        expense,
        scopeKey: `OWNER#${ownerId}`,
        baseVersion: 0,
        payloadValue: payload,
      });
      if (!(await confirmCurrent())) throw cause;
      setNotice('Upcoming expense queued securely and will sync when online.');
    }
  };

  const selected = initialExpenseId
    ? state.items.find(({ expense }) => expense.id === initialExpenseId)
    : undefined;
  const eligibleTransactions = selected
    ? state.transactions
        .filter(
          (transaction) =>
            transaction.accountId === selected.expense.accountId &&
            transaction.currency === selected.expense.currency &&
            transaction.status === 'active' &&
            !transaction.transferId &&
            transaction.amountMinor < 0,
        )
        .map((transaction) => ({
          ...transaction,
          claimVersion: selected.claimVersions[transaction.id] ?? transaction.claimVersion ?? 0,
        }))
    : [];

  if (creating)
    return (
      <section aria-labelledby="new-upcoming-expense-title">
        <h2 id="new-upcoming-expense-title">New upcoming expense</h2>
        <UpcomingExpenseForm
          accounts={state.accounts.map((account) => ({
            id: account.id,
            name: account.friendlyName,
            currency: account.currency,
            scope: account.scope,
          }))}
          budgets={state.budgets}
          groups={state.groups
            .filter((group) => group.status === 'active' && group.joined)
            .map((group) => ({ id: group.id, name: group.name }))}
          {...(initialAccountId ? { initialAccountId } : {})}
          onSave={createExpense}
        />
        {checking ? <p role="status">Checking upcoming expense sources…</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );

  if (selected)
    return (
      <>
        <UpcomingExpenseDetail
          value={selected}
          currentUserId={ownerId}
          csrfToken={csrfToken}
          verifyAccess={async () =>
            Boolean(
              peekFinanceAccess()?.canRead() &&
                state.items.some(
                  ({ expense }) =>
                    expense.id === selected.expense.id && expense.version === selected.expense.version,
                ),
            )
          }
          eligibleTransactions={eligibleTransactions}
          onOpenAccount={onOpenAccount}
          onReschedule={(input) =>
            mutate(
              `/finance/upcoming-expenses/${encodeURIComponent(selected.expense.id)}`,
              'PATCH',
              input,
              selected.expense.id,
            ).then(() => undefined)
          }
          onCancel={(expectedVersion) =>
            mutate(
              `/finance/upcoming-expenses/${encodeURIComponent(selected.expense.id)}/cancel`,
              'POST',
              { expectedVersion },
              selected.expense.id,
            ).then(() => undefined)
          }
          onLinkPayment={(input) =>
            mutate(
              `/finance/upcoming-expenses/${encodeURIComponent(selected.expense.id)}/fulfillments`,
              'POST',
              input,
              selected.expense.id,
            ).then(() => undefined)
          }
          onUnlinkPayment={(fulfillment) => {
            const transaction = state.transactions.find(
              ({ id }) => id === fulfillment.transactionId,
            );
            if (!transaction)
              return Promise.reject(new Error('Transaction source is unavailable.'));
            return mutate(
              `/finance/upcoming-expenses/${encodeURIComponent(selected.expense.id)}/fulfillments/${encodeURIComponent(fulfillment.id)}`,
              'DELETE',
              {
                expectedExpenseVersion: selected.expense.version,
                expectedFulfillmentVersion: fulfillment.version,
                expectedTransactionVersion: transaction.version,
                expectedClaimVersion: selected.claimVersions[fulfillment.transactionId] ?? 0,
              },
              selected.expense.id,
            ).then(() => undefined);
          }}
        />
        {notice ? <p role="status">{notice}</p> : null}
      </>
    );

  return (
    <UpcomingExpensesPage
      items={state.items}
      loading={checking}
      {...(error ? { error } : {})}
      onRetry={() => void refresh()}
      onCreate={onCreate}
      onOpenExpense={onOpenExpense}
      onOpenAccount={onOpenAccount}
    />
  );
}
