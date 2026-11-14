import { FormEvent, useMemo, useState } from 'react';
import { createUlid } from '@naaseh/domain';
import { queueEncryptedBudgetMutation } from '../../../db/finance-repository.js';
import { queueFinanceBudgetActivityChange } from '../../../sync/finance-sync.js';
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
  activity?: 'active' | 'inactive';
  activityChangedAt?: string;
  activityChangedBy?: string;
  closedAt?: string;
  closedBy?: string;
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
  verifyAccess,
  onChange,
}: {
  budget: BudgetDetailView;
  accounts: AccountView[];
  categories: CategoryView[];
  csrfToken: string;
  currentUserId: string;
  verifyAccess: () => Promise<boolean>;
  onChange: (budget: BudgetDetailView) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [kind, setKind] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [lifecycleError, setLifecycleError] = useState('');
  const [notice, setNotice] = useState('');
  const [changingLifecycle, setChangingLifecycle] = useState(false);
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
  const activity =
    budget.activity ??
    (budget.status === 'active' || budget.status === 'changed-since-reconciliation'
      ? 'active'
      : 'inactive');

  const changeLifecycle = async (
    action: 'deactivate' | 'reactivate' | 'close' | 'reopen' | 'save-as-active',
  ) => {
    setLifecycleError('');
    setNotice('');
    if (!(await verifyAccess())) return;
    setChangingLifecycle(true);
    try {
      await financeRequest(
        action === 'save-as-active'
          ? `/finance/budgets/${budget.id}`
          : `/finance/budgets/${budget.id}/${action}`,
        {
          method: action === 'save-as-active' ? 'PATCH' : 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            expectedVersion: budget.version,
            ...(action === 'save-as-active' ? { status: 'active' } : {}),
          }),
        },
      );
      if (!(await verifyAccess())) return;
      onChange(budget);
    } catch {
      if (!navigator.onLine && (action === 'deactivate' || action === 'reactivate')) {
        const nextActivity = action === 'deactivate' ? 'inactive' : 'active';
        try {
          await queueFinanceBudgetActivityChange({
            budget,
            activity: nextActivity,
            actorId: currentUserId,
          });
          if (!(await verifyAccess())) return;
          setNotice(
            `Budget ${nextActivity === 'active' ? 'reactivation' : 'deactivation'} queued securely and will sync when online.`,
          );
          return;
        } catch {
          setLifecycleError(
            'The budget activity change could not be queued securely. Refresh and retry when connected.',
          );
          return;
        }
      }
      setLifecycleError(
        'The budget state could not be changed. Your membership or budget version may have changed; refresh and retry.',
      );
    } finally {
      setChangingLifecycle(false);
    }
  };

  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    const major = Number(amount);
    if (
      !description.trim() ||
      !categoryId ||
      !Number.isFinite(major) ||
      major <= 0 ||
      !Number.isInteger(major * 100)
    ) {
      setError('Enter a description, category, and exact positive amount.');
      return;
    }
    const plannedAmountMinor = Math.round(major * 100) * (kind === 'debit' ? -1 : 1);
    setError('');
    setNotice('');
    if (!(await verifyAccess())) return;
    try {
      await financeRequest<BudgetItemView>(`/finance/budgets/${budget.id}/items`, {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedBudgetVersion: budget.version,
          description: description.trim(),
          financeCategoryId: categoryId,
          plannedAmountMinor,
          currency: 'USD',
          currencyExponent: 2,
          relatedAccountIds: accountIds,
        }),
      });
      // A mutation response is not retained display evidence. Recheck the source and let the
      // parent replace this view from canonical proof-bearing GETs.
      if (!(await verifyAccess())) return;
      onChange(budget);
    } catch {
      if (!navigator.onLine) {
        const id = createUlid();
        try {
          await queueEncryptedBudgetMutation({
            entityId: id,
            entityType: 'financeBudgetItem',
            budgetId: budget.id,
            scopeKey: `GROUP#${budget.groupId}`,
            baseVersion: 0,
            value: {
              id,
              budgetId: budget.id,
              expectedBudgetVersion: budget.version,
              description: description.trim(),
              financeCategoryId: categoryId,
              plannedAmountMinor,
              currency: 'USD',
              currencyExponent: 2,
              relatedAccountIds: accountIds,
              creatorId: 'pending',
              status: 'active',
              version: 1,
            },
          });
          if (!(await verifyAccess())) return;
          setAdding(false);
          setDescription('');
          setAmount('');
          setNotice('Budget item queued securely and will sync when online.');
        } catch {
          setError('The item could not be queued securely. Your form is still available.');
        }
      } else setError('The item could not be saved. Refresh the budget before retrying.');
    }
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
        <div>
          <button onClick={() => setAdding(true)}>Add budget item</button>
          {budget.status === 'draft' ? (
            <button
              disabled={changingLifecycle}
              onClick={() => void changeLifecycle('save-as-active')}
            >
              Save as active
            </button>
          ) : activity === 'active' ? (
            <button disabled={changingLifecycle} onClick={() => void changeLifecycle('deactivate')}>
              Deactivate
            </button>
          ) : (
            <button disabled={changingLifecycle} onClick={() => void changeLifecycle('reactivate')}>
              Reactivate
            </button>
          )}
          {budget.closedAt ? (
            <button disabled={changingLifecycle} onClick={() => void changeLifecycle('reopen')}>
              Reopen
            </button>
          ) : (
            <button disabled={changingLifecycle} onClick={() => void changeLifecycle('close')}>
              Close
            </button>
          )}
        </div>
      </header>
      <p>Budget activity: {activity === 'active' ? 'Active' : 'Inactive'}</p>
      <p>{budget.status === 'draft' ? 'Legacy draft' : budget.closedAt ? 'Closed' : 'Open'}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {lifecycleError ? <p role="alert">{lifecycleError}</p> : null}
      {!budget.totalsComplete ? (
        <p role="alert">
          Totals are incomplete because this view cannot access every linked account.
        </p>
      ) : null}
      <BudgetReconciliation
        budget={budget}
        csrfToken={csrfToken}
        verifyAccess={verifyAccess}
        onReconciled={() => onChange(budget)}
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
              verifyAccess={verifyAccess}
            />
          </article>
        ))}
      </div>
      {adding ? (
        <dialog open aria-label="Add budget item">
          <form onSubmit={(event) => void saveItem(event)}>
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
