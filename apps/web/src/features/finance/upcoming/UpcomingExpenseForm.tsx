import { FormEvent, useMemo, useState } from 'react';
import { localFinanceDate, parseMajorUnits } from '@naaseh/domain';

export interface UpcomingExpenseAccountOption {
  id: string;
  name: string;
  currency: string;
  scope: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
}

export interface UpcomingExpenseBudgetOption {
  id: string;
  name: string;
  groupId: string;
  status: 'draft' | 'active' | 'changed-since-reconciliation' | 'archived' | 'tombstone';
  activity?: 'active' | 'inactive';
  closedAt?: string;
}

export interface UpcomingExpenseGroupOption {
  id: string;
  name: string;
}

export interface UpcomingExpenseFormValue {
  description: string;
  expectedAmountMinor: number;
  dueDate: string;
  entryContext: { enteredAt: string; localDate: string; timeZone: string };
  accountId: string;
  budgetId: string;
  groupId: string;
}

export function UpcomingExpenseForm({
  accounts,
  budgets,
  groups,
  initialAccountId,
  now = () => new Date(),
  onSave,
}: {
  accounts: UpcomingExpenseAccountOption[];
  budgets: UpcomingExpenseBudgetOption[];
  groups: UpcomingExpenseGroupOption[];
  initialAccountId?: string;
  now?: () => Date;
  onSave: (value: UpcomingExpenseFormValue) => Promise<void>;
}) {
  const initialAccount = accounts.find(({ id }) => id === initialAccountId);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [groupId, setGroupId] = useState(
    initialAccount?.scope.type === 'group' ? initialAccount.scope.groupId : '',
  );
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [budgetId, setBudgetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligibleBudgets = useMemo(
    () =>
      budgets.filter(
        (budget) =>
          budget.groupId === groupId &&
          budget.activity !== 'inactive' &&
          !budget.closedAt &&
          (budget.status === 'active' || budget.status === 'changed-since-reconciliation'),
      ),
    [budgets, groupId],
  );
  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.scope.type === 'owner' || account.scope.groupId === groupId,
      ),
    [accounts, groupId],
  );
  const selectedAccount = accounts.find(({ id }) => id === accountId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!description.trim() || !dueDate || !groupId || !budgetId || !selectedAccount) {
      setError('Complete Description, Expected amount, Date, Account, Budget, and Group.');
      return;
    }
    let expectedAmountMinor: number;
    try {
      expectedAmountMinor = parseMajorUnits(amount, selectedAccount.currency);
      if (expectedAmountMinor <= 0) throw new Error('Expected amount must be positive.');
    } catch {
      setError(`Enter a positive amount in ${selectedAccount.currency}.`);
      return;
    }
    const entered = now();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const entryContext = {
      enteredAt: entered.toISOString(),
      localDate: localFinanceDate(entered.toISOString(), timeZone),
      timeZone,
    };
    if (dueDate <= entryContext.localDate) {
      setError('Choose a date after today in this browser’s local calendar.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        description: description.trim(),
        expectedAmountMinor,
        dueDate,
        entryContext,
        accountId,
        budgetId,
        groupId,
      });
    } catch {
      setError('The expense was not saved. Your entries are still available to retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <fieldset disabled={saving}>
        <legend>Add upcoming expense</legend>
        <p>This records an expected obligation. It does not post a payment or change a balance.</p>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label>
          Expected amount
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          Date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label>
          Group
          <select
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              setBudgetId('');
              const account = accounts.find(({ id }) => id === accountId);
              if (account?.scope.type === 'group' && account.scope.groupId !== event.target.value)
                setAccountId('');
            }}
          >
            <option value="">Choose a group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget
          <select value={budgetId} onChange={(event) => setBudgetId(event.target.value)}>
            <option value="">Choose an active budget</option>
            {eligibleBudgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Choose an account</option>
            {eligibleAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </label>
        {!groups.length ? (
          <p role="status">Join or create a group before adding an upcoming expense.</p>
        ) : groupId && !eligibleBudgets.length ? (
          <p role="status">Create or reactivate an open budget for this group first.</p>
        ) : null}
        <button type="submit">{saving ? 'Saving…' : 'Save upcoming expense'}</button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
