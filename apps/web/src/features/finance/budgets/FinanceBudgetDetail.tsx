import { queueEncryptedBudgetMutation } from '../../../db/finance-repository.js';
import { parseMajorUnits, createUlid } from '@naaseh/domain';
import { FormEvent, useMemo, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { BudgetReconciliation } from './BudgetReconciliation.js';
import { CreateFinancialTask } from './CreateFinancialTask.js';

export interface BudgetTotalView {
  currency: string;
  currencyExponent: number;
  plannedMinor: number;
  actualMinor: number;
  varianceMinor: number;
}

export interface BudgetItemView {
  id: string;
  description: string;
  financeCategoryId: string;
  plannedAmountMinor: number;
  actualAmountMinor?: number;
  varianceMinor?: number;
  currency: string;
  currencyExponent: number;
  relatedAccountIds: string[];
  applicableDate?: string;
  status?: string;
  version: number;
}

export interface ReconciliationRecordView {
  id: string;
  budgetId: string;
  reconciledAt: string;
  reconciledBy: string;
  budgetVersion: number;
  sourceVersionDigest: string;
  totalsByCurrency: BudgetTotalView[];
  totalsByCategory: Array<BudgetTotalView & { financeCategoryId: string }>;
}

export interface BudgetDetailView {
  id: string;
  groupId: string;
  name: string;
  budgetDate: string;
  startDate: string;
  endDate?: string | null;
  status: string;
  items: BudgetItemView[];
  totals: BudgetTotalView[];
  categoryTotals?: Array<BudgetTotalView & { financeCategoryId: string }>;
  totalsComplete: boolean;
  lastReconciledAt?: string;
  reconciliationReadiness?: { canReconcile: boolean; reasons: string[] };
  reconciliations?: ReconciliationRecordView[];
  version: number;
}

interface CategoryView {
  id: string;
  name: string;
}
interface AccountView {
  id: string;
  friendlyName: string;
  currency: string;
}

const money = (minor: number, currency: string, exponent: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(Math.abs(minor) / 10 ** exponent);

export function FinanceBudgetDetail({
  budget,
  accounts,
  categories,
  csrfToken,
  currentUserId,
  onChange,
}: {
  budget: BudgetDetailView;
  accounts: AccountView[];
  categories: CategoryView[];
  csrfToken: string;
  currentUserId: string;
  onChange: (budget: BudgetDetailView) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [kind, setKind] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const accountIds = useMemo(() => accounts.map(({ id }) => id), [accounts]);
  const categoryTotals = useMemo(
    () =>
      budget.categoryTotals ??
      budget.items.map((item) => ({
        financeCategoryId: item.financeCategoryId,
        currency: item.currency,
        currencyExponent: item.currencyExponent,
        plannedMinor: item.plannedAmountMinor,
        actualMinor: item.actualAmountMinor ?? 0,
        varianceMinor:
          item.varianceMinor ?? (item.actualAmountMinor ?? 0) - item.plannedAmountMinor,
      })),
    [budget.categoryTotals, budget.items],
  );

  const saveItem = (event: FormEvent) => {
    event.preventDefault();
    let minor: number;
    try {
      minor = parseMajorUnits(amount, 'USD');
      if (!description.trim() || !categoryId || minor <= 0) throw new Error('Invalid item.');
    } catch {
      setError('Enter a description, category, and exact positive amount.');
      return;
    }
    const plannedAmountMinor = minor * (kind === 'debit' ? -1 : 1);
    const optimistic: BudgetItemView = {
      id: createUlid(),
      description: description.trim(),
      financeCategoryId: categoryId,
      plannedAmountMinor,
      actualAmountMinor: 0,
      varianceMinor: -plannedAmountMinor,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: accountIds,
      version: 1,
    };
    onChange({ ...budget, items: [...budget.items, optimistic], version: budget.version + 1 });
    setAdding(false);
    setDescription('');
    setAmount('');
    setError('');
    if (!navigator.onLine) {
      void queueEncryptedBudgetMutation({
        entityId: optimistic.id,
        entityType: 'financeBudgetItem',
        budgetId: budget.id,
        scopeKey: `GROUP#${budget.groupId}`,
        baseVersion: budget.version,
        value: { ...optimistic, budgetId: budget.id, status: 'active' },
        command: {
          budgetId: budget.id,
          description: optimistic.description,
          financeCategoryId: optimistic.financeCategoryId,
          plannedAmountMinor,
          currency: optimistic.currency,
          currencyExponent: optimistic.currencyExponent,
          relatedAccountIds: optimistic.relatedAccountIds,
        },
      }).catch(() => {
        onChange(budget);
        setError('The item could not be saved on this device.');
      });
      return;
    }
    void financeRequest<BudgetItemView>(`/finance/budgets/${budget.id}/items`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        expectedBudgetVersion: budget.version,
        description: optimistic.description,
        financeCategoryId: optimistic.financeCategoryId,
        plannedAmountMinor,
        currency: optimistic.currency,
        currencyExponent: optimistic.currencyExponent,
        relatedAccountIds: optimistic.relatedAccountIds,
      }),
    })
      .then((saved) =>
        onChange({ ...budget, items: [...budget.items, saved], version: budget.version + 1 }),
      )
      .catch(() => {
        onChange(budget);
        setError('The item could not be saved. Review it and try again.');
      });
  };

  return (
    <section className="finance-budget-detail" aria-label={`${budget.name} budget`}>
      <header>
        <div>
          <h2>{budget.name}</h2>
          <p>
            {budget.startDate} – {budget.endDate ?? 'Open-ended'}
          </p>
        </div>
        <button onClick={() => setAdding(true)}>Add budget item</button>
      </header>
      {!budget.totalsComplete ? (
        <p role="alert">
          Totals are incomplete because this view cannot access every linked account.
        </p>
      ) : null}
      <BudgetReconciliation
        budget={budget}
        csrfToken={csrfToken}
        onReconciled={(record) =>
          onChange({
            ...budget,
            status: 'active',
            lastReconciledAt: record.reconciledAt,
            reconciliations: [record, ...(budget.reconciliations ?? [])],
            version: budget.version + 1,
          })
        }
      />
      <div className="finance-budget-totals">
        {budget.totals.map((total) => (
          <section
            key={`${total.currency}:${total.currencyExponent}`}
            aria-label={`${total.currency} budget totals`}
          >
            <h3>{total.currency}</h3>
            <dl>
              <div>
                <dt>Planned</dt>
                <dd>{money(total.plannedMinor, total.currency, total.currencyExponent)}</dd>
              </div>
              <div>
                <dt>Actual</dt>
                <dd>{money(total.actualMinor, total.currency, total.currencyExponent)}</dd>
              </div>
              <div>
                <dt>Variance</dt>
                <dd>{money(total.varianceMinor, total.currency, total.currencyExponent)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <div className="finance-budget-categories">
        {categoryTotals.map((total) => (
          <section
            key={`${total.financeCategoryId}:${total.currency}`}
            aria-label={`${categories.find(({ id }) => id === total.financeCategoryId)?.name ?? 'Category'} category totals`}
          >
            <h3>
              {categories.find(({ id }) => id === total.financeCategoryId)?.name ?? 'Category'}
            </h3>
            <p>Variance {money(total.varianceMinor, total.currency, total.currencyExponent)}</p>
          </section>
        ))}
      </div>
      <div className="finance-budget-items">
        {budget.items.map((item) => (
          <article
            key={item.id}
            id={`item-${item.id}`}
            aria-label={`${item.description} budget item`}
          >
            <h3>{item.description}</h3>
            <p>Planned {money(item.plannedAmountMinor, item.currency, item.currencyExponent)}</p>
            <p>Actual {money(item.actualAmountMinor ?? 0, item.currency, item.currencyExponent)}</p>
            <p>
              Variance{' '}
              {money(
                item.varianceMinor ?? (item.actualAmountMinor ?? 0) - item.plannedAmountMinor,
                item.currency,
                item.currencyExponent,
              )}
            </p>
            <CreateFinancialTask
              budgetItemId={item.id}
              description={item.description}
              {...(item.applicableDate ? { applicableDate: item.applicableDate } : {})}
              currentUserId={currentUserId}
              csrfToken={csrfToken}
            />
          </article>
        ))}
      </div>
      {adding ? (
        <dialog open aria-label="Add budget item">
          <form onSubmit={saveItem}>
            <h2>Add budget item</h2>
            <label>
              Description
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              Category
              <select
                aria-label="Category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                aria-label="Type"
                value={kind}
                onChange={(event) => setKind(event.target.value as 'debit' | 'credit')}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </label>
            <label>
              Planned amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div>
              <button type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit">Save item</button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
