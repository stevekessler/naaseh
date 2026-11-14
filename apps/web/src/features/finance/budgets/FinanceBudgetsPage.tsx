import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createUlid, type GroupView } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { FinanceBudgetDetail, type BudgetDetailView } from './FinanceBudgetDetail.js';
import { ReusableItemsPage } from './ReusableItemsPage.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';
import {
  queueEncryptedBudgetCreationPlan,
  queueEncryptedBudgetMutation,
} from '../../../db/finance-repository.js';
import { listLocalGroups } from '../../../db/group-repository.js';

interface AccountView {
  id: string;
  friendlyName: string;
  currency: string;
  scope: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
}
interface CategoryView {
  id: string;
  name: string;
}

interface BudgetSnapshot {
  budgets: BudgetDetailView[];
  accounts: AccountView[];
  categories: CategoryView[];
  groups: GroupView[];
  groupLoadError: boolean;
}

export function FinanceBudgetsPage({
  csrfToken,
  currentUserId,
  initialBudgetId,
  onOpenBudget,
  onOpenGroups,
}: {
  csrfToken: string;
  currentUserId: string;
  initialBudgetId?: string;
  onOpenBudget?: (budgetId: string) => void;
  onOpenGroups?: () => void;
}) {
  const [budgets, setBudgets] = useState<BudgetDetailView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [membershipGroups, setMembershipGroups] = useState<GroupView[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupLoadError, setGroupLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialBudgetId);
  const [creating, setCreating] = useState(false);
  const [showReusable, setShowReusable] = useState(false);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [budgetDate, setBudgetDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const snapshot = useRef<FinanceApiSnapshot<BudgetSnapshot> | undefined>(undefined);
  const serial = useRef(0),
    visit = useRef(0);
  const [checking, setChecking] = useState(false);
  const clearSnapshot = useCallback(() => {
    serial.current++;
    visit.current++;
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    snapshot.current = undefined;
    setBudgets([]);
    setAccounts([]);
    setCategories([]);
    setMembershipGroups([]);
    setGroupsLoading(false);
    setGroupLoadError(false);
    setSelectedId(undefined);
    setCreating(false);
    setShowReusable(false);
    setName('');
    setGroupId('');
    setBudgetDate('');
    setStartDate('');
    setEndDate('');
    setSelectedAccounts([]);
    setChecking(false);
    setNotice('');
    setError('Reconnect and refresh Finance to view budgets.');
  }, []);
  const refreshBudgets = useCallback(
    async (selected?: string) => {
      const current = ++serial.current;
      setChecking(true);
      setGroupsLoading(true);
      setError('');
      let retained: FinanceApiSnapshot<BudgetSnapshot> | undefined;
      try {
        retained = await loadFinanceApiSnapshot(async (request) => {
          const [budgetPage, accountPage, categoryPage, groupResult] = await Promise.all([
            request<{ items: BudgetDetailView[] }>('/finance/budgets'),
            request<{ items: AccountView[] }>('/finance/accounts'),
            request<{ items: CategoryView[] }>('/finance/categories'),
            listLocalGroups()
              .then((groups) => ({ groups, failed: false }))
              .catch(() => ({ groups: [] as GroupView[], failed: true })),
          ]);
          const detail = selected
            ? await request<BudgetDetailView>(`/finance/budgets/${encodeURIComponent(selected)}`)
            : undefined;
          return {
            budgets: detail
              ? [...budgetPage.items.filter(({ id }) => id !== detail.id), detail]
              : budgetPage.items,
            accounts: accountPage.items,
            categories: categoryPage.items,
            groups: groupResult.groups,
            groupLoadError: groupResult.failed,
          };
        });
        if (current !== serial.current) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        const value = await readFinanceApiSnapshot(retained, (value) => value);
        if (current !== serial.current) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
        snapshot.current = retained;
        setBudgets(value.budgets);
        setAccounts(value.accounts);
        setCategories(value.categories);
        setMembershipGroups(value.groups);
        setGroupsLoading(false);
        setGroupLoadError(value.groupLoadError);
        setSelectedId(selected);
        setChecking(false);
        return true;
      } catch {
        if (retained) disposeFinanceApiSnapshot(retained);
        if (current === serial.current) clearSnapshot();
        return false;
      }
    },
    [clearSnapshot],
  );
  useEffect(() => {
    clearSnapshot();
    const unsubscribe = peekFinanceAccess()?.onLock(clearSnapshot);
    void refreshBudgets(initialBudgetId);
    return () => {
      unsubscribe?.();
      serial.current++;
      visit.current++;
      if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
      snapshot.current = undefined;
    };
  }, [currentUserId, initialBudgetId, clearSnapshot, refreshBudgets]);

  const checkSnapshot = async () => {
    const retained = snapshot.current,
      current = serial.current;
    if (!retained) return false;
    try {
      await readFinanceApiSnapshot(retained, () => true);
      return current === serial.current && retained === snapshot.current;
    } catch {
      if (current === serial.current) clearSnapshot();
      return false;
    }
  };

  const groups = useMemo(
    () =>
      membershipGroups
        .filter((group) => group.joined && group.status === 'active')
        .sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
    [membershipGroups],
  );
  const privateSelected = selectedAccounts.some(
    (id) => accounts.find((account) => account.id === id)?.scope.type === 'owner',
  );

  const openBudget = async (id: string) => {
    if (!(await checkSnapshot())) return;
    if (await refreshBudgets(id)) onOpenBudget?.(id);
  };
  const displayedVisit = visit.current;
  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!(await checkSnapshot()) || displayedVisit !== visit.current) return;
    try {
      const created = await financeRequest<BudgetDetailView>('/finance/budgets', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          groupId,
          name,
          budgetDate,
          startDate,
          endDate: endDate || null,
          status: 'active',
        }),
      });
      if (displayedVisit !== visit.current) return;
      if (!(await checkSnapshot()) || displayedVisit !== visit.current) return;
      let expectedBudgetVersion = created.version;
      let linkingIncomplete = false;
      for (const accountId of selectedAccounts) {
        if (displayedVisit !== visit.current) return;
        try {
          await financeRequest(`/finance/budgets/${created.id}/accounts`, {
            method: 'POST',
            csrfToken,
            idempotencyKey: crypto.randomUUID(),
            body: JSON.stringify({ accountId, expectedBudgetVersion }),
          });
          expectedBudgetVersion++;
          if (!(await checkSnapshot()) || displayedVisit !== visit.current) return;
        } catch {
          linkingIncomplete = true;
          break;
        }
      }
      if (displayedVisit !== visit.current) return;
      if (await refreshBudgets(created.id)) {
        setCreating(false);
        if (linkingIncomplete)
          setError('The budget was created, but some accounts could not be linked.');
        onOpenBudget?.(created.id);
      }
    } catch {
      if (displayedVisit !== visit.current) return;
      if (!navigator.onLine) {
        const entityId = createUlid();
        const value = {
          id: entityId,
          groupId,
          name,
          budgetDate,
          startDate,
          endDate: endDate || null,
          status: 'active',
          version: 1,
        };
        try {
          if (!(await checkSnapshot()) || displayedVisit !== visit.current) return;
          if (selectedAccounts.length)
            await queueEncryptedBudgetCreationPlan({
              budgetId: entityId,
              groupId,
              scopeKey: `GROUP#${groupId}`,
              value,
              accountIds: selectedAccounts,
            });
          else
            await queueEncryptedBudgetMutation({
              entityId,
              entityType: 'financeBudget',
              budgetId: entityId,
              scopeKey: `GROUP#${groupId}`,
              baseVersion: 0,
              value,
            });
          if (!(await checkSnapshot()) || displayedVisit !== visit.current) return;
          setCreating(false);
          setNotice('Budget queued securely and will sync when online.');
        } catch {
          if (displayedVisit === visit.current)
            setError('The budget could not be queued securely. Your form is still available.');
        }
      } else
        setError(
          'The budget could not be completed. Your membership may have changed; review Groups and retry. Your form is still available.',
        );
    }
  };
  const selected = budgets.find(({ id }) => id === selectedId);
  if (showReusable)
    return (
      <ReusableItemsPage
        key={`${currentUserId}:${displayedVisit}`}
        budgets={budgets}
        groups={groups}
        accounts={accounts}
        categories={categories}
        csrfToken={csrfToken}
        onBack={() =>
          void checkSnapshot().then((allowed) => {
            if (allowed) setShowReusable(false);
          })
        }
      />
    );
  if (selected)
    return (
      <>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        <FinanceBudgetDetail
          key={`${currentUserId}:${displayedVisit}:${selected.id}`}
          budget={selected}
          accounts={accounts}
          categories={categories}
          csrfToken={csrfToken}
          currentUserId={currentUserId}
          verifyAccess={checkSnapshot}
          onChange={(updated) => {
            if (displayedVisit === visit.current) void refreshBudgets(updated.id);
          }}
        />
      </>
    );

  return (
    <section className="finance-budgets">
      <header>
        <h2>Budgets</h2>
        <div>
          <button
            disabled={checking}
            onClick={() =>
              void checkSnapshot().then((allowed) => {
                if (allowed) setShowReusable(true);
              })
            }
          >
            Reusable items
          </button>
          <button disabled={checking} onClick={() => setCreating(true)}>
            Create budget
          </button>
          <button disabled={checking} onClick={() => void refreshBudgets()}>
            {checking ? 'Checking budgets…' : 'Refresh budgets'}
          </button>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="finance-budget-list">
        {budgets.map((budget) => (
          <article key={budget.id}>
            <h3>{budget.name}</h3>
            <p>
              {budget.startDate} – {budget.endDate ?? 'Open-ended'}
            </p>
            <p>{budget.totalsComplete ? 'Complete' : 'Incomplete totals'}</p>
            <button disabled={checking} onClick={() => void openBudget(budget.id)}>
              Open budget
            </button>
          </article>
        ))}
      </div>
      {creating ? (
        <dialog open aria-label="Create budget">
          <form onSubmit={(event) => void saveBudget(event)}>
            <h2>Create budget</h2>
            <label>
              Budget name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Group
              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                disabled={groupsLoading || groupLoadError || groups.length === 0}
                required
              >
                <option value="">Select group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {groupsLoading ? <p role="status">Loading eligible groups…</p> : null}
            {groupLoadError ? (
              <p role="alert">Groups could not be loaded. Refresh budgets before saving.</p>
            ) : null}
            {!groupsLoading && !groupLoadError && groups.length === 0 ? (
              <div>
                <p>You are not currently an active member of an eligible group.</p>
                {onOpenGroups ? (
                  <button type="button" onClick={onOpenGroups}>
                    Manage groups
                  </button>
                ) : null}
              </div>
            ) : null}
            <label>
              Budget date
              <input
                type="date"
                value={budgetDate}
                onChange={(event) => setBudgetDate(event.target.value)}
                required
              />
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Accounts</legend>
              {accounts.length === 0 ? (
                <p>No accounts are required. You can link authorized accounts later.</p>
              ) : null}
              {accounts.map((account) => (
                <div className="finance-budget-account-option" key={account.id}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={account.friendlyName}
                      checked={selectedAccounts.includes(account.id)}
                      onChange={(event) =>
                        setSelectedAccounts((current) =>
                          event.target.checked
                            ? [...current, account.id]
                            : current.filter((id) => id !== account.id),
                        )
                      }
                    />
                    {account.friendlyName}
                  </label>
                  <span>
                    {account.scope.type === 'group' ? 'Group account' : 'Private account'}
                  </span>
                </div>
              ))}
            </fieldset>
            {privateSelected ? (
              <p role="note">
                A private account may make totals incomplete for other group members without
                revealing its identity or amount.
              </p>
            ) : null}
            <div>
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit">Save budget</button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
