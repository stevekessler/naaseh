import { createUlid } from '@naaseh/domain';
import { queueEncryptedBudgetMutation } from '../../../db/finance-repository.js';
import { loadLocalFinanceBudgets } from '../../../sync/finance-local.js';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { FinanceBudgetDetail, type BudgetDetailView } from './FinanceBudgetDetail.js';
import { ReusableItemsPage } from './ReusableItemsPage.js';

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

const initialBudgetId = () => location.pathname.match(/^\/finance\/budgets\/([^/]+)\/?$/u)?.[1];

export function FinanceBudgetsPage({
  csrfToken,
  currentUserId,
}: {
  csrfToken: string;
  currentUserId: string;
}) {
  const [budgets, setBudgets] = useState<BudgetDetailView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
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

  useEffect(() => {
    if (!navigator.onLine) {
      void loadLocalFinanceBudgets()
        .then(({ budgets, accounts, categories }) => {
          setBudgets(budgets);
          setAccounts(accounts);
          setCategories(categories);
        })
        .catch(() => setError('Saved budgets could not be opened.'));
      return;
    }
    void Promise.all([
      financeRequest<{ items: BudgetDetailView[]; cursor: string | null }>('/finance/budgets'),
      financeRequest<{ items: AccountView[] }>('/finance/accounts'),
      financeRequest<{ items: CategoryView[] }>('/finance/categories'),
    ])
      .then(([budgetPage, accountPage, categoryPage]) => {
        setBudgets(budgetPage.items);
        setAccounts(accountPage.items);
        setCategories(categoryPage.items);
        const directId = initialBudgetId();
        if (directId) {
          void financeRequest<BudgetDetailView>(`/finance/budgets/${directId}`)
            .then((detail) => {
              setBudgets((current) => [...current.filter(({ id }) => id !== detail.id), detail]);
              setSelectedId(detail.id);
            })
            .catch(() => setError('The budget could not be opened.'));
        }
      })
      .catch(() => setError('Budgets are unavailable.'));
  }, []);

  const groups = useMemo(
    () => [
      ...new Set(
        accounts.flatMap((account) =>
          account.scope.type === 'group' ? [account.scope.groupId] : [],
        ),
      ),
    ],
    [accounts],
  );
  const privateSelected = selectedAccounts.some(
    (id) => accounts.find((account) => account.id === id)?.scope.type === 'owner',
  );

  const openBudget = (id: string) => {
    setSelectedId(id);
    history.pushState({}, '', `/finance/budgets/${encodeURIComponent(id)}`);
  };
  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (!navigator.onLine) {
        const id = createUlid(),
          scopeKey = `GROUP#${groupId}`;
        const command = { groupId, name, budgetDate, startDate, endDate: endDate || null };
        const created: BudgetDetailView = {
          id,
          ...command,
          status: 'draft',
          items: [],
          totals: [],
          categoryTotals: [],
          totalsComplete: true,
          version: 1,
        };
        const started = Date.now();
        await queueEncryptedBudgetMutation({
          entityId: id,
          entityType: 'financeBudget',
          budgetId: id,
          scopeKey,
          baseVersion: 0,
          value: created,
          command,
          createdAt: new Date(started).toISOString(),
        });
        let version = 1;
        for (const accountId of selectedAccounts) {
          const linkId = createUlid();
          await queueEncryptedBudgetMutation({
            entityId: linkId,
            entityType: 'financeBudgetAccountLink',
            budgetId: id,
            scopeKey,
            baseVersion: version,
            value: { id: linkId, budgetId: id, accountId, status: 'active', version: 1 },
            command: { budgetId: id, accountId },
            createdAt: new Date(started + version).toISOString(),
          });
          version++;
        }
        created.version = version;
        setBudgets((current) => [...current, created]);
        setSelectedId(id);
        setCreating(false);
        return;
      }
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
        }),
      });
      let expectedBudgetVersion = created.version;
      let linkingFailed = false;
      for (const accountId of selectedAccounts) {
        try {
          await financeRequest(`/finance/budgets/${created.id}/accounts`, {
            method: 'POST',
            csrfToken,
            idempotencyKey: crypto.randomUUID(),
            body: JSON.stringify({ accountId, expectedBudgetVersion }),
          });
          expectedBudgetVersion += 1;
        } catch {
          linkingFailed = true;
          break;
        }
      }
      const detail = await financeRequest<BudgetDetailView>(`/finance/budgets/${created.id}`).catch(
        () => ({ ...created, version: expectedBudgetVersion }),
      );
      setBudgets((current) => [...current.filter(({ id }) => id !== created.id), detail]);
      setSelectedId(created.id);
      setCreating(false);
      if (linkingFailed)
        setError(
          'The budget was created, but some accounts could not be linked. Review its accounts before adding items.',
        );
      history.pushState({}, '', `/finance/budgets/${encodeURIComponent(created.id)}`);
    } catch {
      setError('The budget could not be created.');
    }
  };
  const selected = budgets.find(({ id }) => id === selectedId);
  if (showReusable)
    return (
      <ReusableItemsPage
        budgets={budgets}
        accounts={accounts}
        categories={categories}
        csrfToken={csrfToken}
        onBack={() => setShowReusable(false)}
      />
    );
  if (selected)
    return (
      <>
        {error ? <p role="alert">{error}</p> : null}
        <FinanceBudgetDetail
          budget={selected}
          accounts={accounts}
          categories={categories}
          csrfToken={csrfToken}
          currentUserId={currentUserId}
          onChange={(updated) =>
            setBudgets((current) =>
              current.map((budget) => (budget.id === updated.id ? updated : budget)),
            )
          }
        />
      </>
    );

  return (
    <section className="finance-budgets">
      <header>
        <h2>Budgets</h2>
        <div>
          <button onClick={() => setShowReusable(true)}>Reusable items</button>
          <button onClick={() => setCreating(true)}>Create budget</button>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="finance-budget-list">
        {budgets.map((budget) => (
          <article key={budget.id}>
            <h3>{budget.name}</h3>
            <p>
              {budget.startDate} – {budget.endDate ?? 'Open-ended'}
            </p>
            <p>{budget.totalsComplete ? 'Complete' : 'Incomplete totals'}</p>
            <button onClick={() => openBudget(budget.id)}>Open budget</button>
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
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
                <option value="">Select group</option>
                {groups.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
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
