import { parseMajorUnits } from '@naaseh/domain';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { createUlid } from '@naaseh/domain';
import { queueEncryptedReusableItemMutation } from '../../../db/finance-repository.js';
import type { BudgetDetailView } from './FinanceBudgetDetail.js';
import { TransactionMatches } from './TransactionMatches.js';

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
interface ReusableItemView {
  id: string;
  groupId: string;
  description: string;
  financeCategoryId: string;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent: number;
  relatedAccountIds: string[];
  applicableDate?: string;
  status: string;
  version: number;
}
interface OfferView {
  reusableItemId: string;
  occurrenceDate: string;
  description: string;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent: number;
}

const money = (minor: number, currency: string, exponent: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(Math.abs(minor) / 10 ** exponent);

export function ReusableItemsPage({
  budgets,
  accounts,
  categories,
  csrfToken,
  onBack,
}: {
  budgets: BudgetDetailView[];
  accounts: AccountView[];
  categories: CategoryView[];
  csrfToken: string;
  onBack: () => void;
}) {
  const [items, setItems] = useState<ReusableItemView[]>([]);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [offerBudget, setOfferBudget] = useState<BudgetDetailView>();
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [applicableDate, setApplicableDate] = useState('');
  const [kind, setKind] = useState<'debit' | 'credit'>('debit');
  const [schedule, setSchedule] = useState<'future' | 'recurring'>('future');
  const [interval, setInterval] = useState('1');
  const [unit, setUnit] = useState('month');
  const [recurrenceStart, setRecurrenceStart] = useState('');
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const groups = useMemo(() => [...new Set(budgets.map(({ groupId: id }) => id))], [budgets]);

  useEffect(() => {
    void financeRequest<{ items: ReusableItemView[] }>('/finance/reusable-items')
      .then((page) => setItems(page.items))
      .catch(() => setError('Reusable items are unavailable.'));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    let minor: number;
    try {
      minor = parseMajorUnits(amount, 'USD');
      if (minor <= 0) throw new Error('Invalid amount.');
    } catch {
      setError('Enter an exact positive amount.');
      return;
    }
    const groupAccounts = accounts.filter(
      (account) =>
        account.scope.type === 'group' &&
        account.scope.groupId === groupId &&
        account.currency === 'USD',
    );
    const value = {
      groupId,
      description,
      financeCategoryId: categoryId,
      plannedAmountMinor: minor * (kind === 'debit' ? -1 : 1),
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: groupAccounts.map(({ id }) => id),
      ...(schedule === 'future'
        ? { applicableDate }
        : {
            recurrence: {
              interval: Number(interval),
              unit,
              startDate: recurrenceStart,
              ...(recurrenceEnd ? { endDate: recurrenceEnd } : {}),
            },
          }),
    };
    try {
      const saved = await financeRequest<ReusableItemView>('/finance/reusable-items', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify(value),
      });
      setItems((current) => [...current, saved]);
      setCreating(false);
      setDescription('');
      setAmount('');
    } catch {
      if (!navigator.onLine) {
        const entityId = createUlid();
        try {
          await queueEncryptedReusableItemMutation({
            entityId,
            scopeKey: `GROUP#${groupId}`,
            baseVersion: 0,
            value: { id: entityId, ...value, creatorId: 'pending', status: 'active', version: 1 },
          });
          setCreating(false);
          setNotice('Reusable item queued securely and will sync when online.');
        } catch {
          setError('The reusable item could not be queued securely.');
        }
      } else setError('The reusable item could not be saved.');
    }
  };

  const loadOffers = async (budget: BudgetDetailView) => {
    setError('');
    setNotice('');
    try {
      const page = await financeRequest<{ items: OfferView[] }>(
        `/finance/budgets/${budget.id}/reusable-offers`,
      );
      setOfferBudget(budget);
      setOffers(page.items);
    } catch {
      setError('Future offers could not be loaded.');
    }
  };

  const copy = async (offer: OfferView) => {
    if (!offerBudget) return;
    try {
      await financeRequest(
        `/finance/budgets/${offerBudget.id}/reusable-items/${offer.reusableItemId}/copy`,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            occurrenceDate: offer.occurrenceDate,
            expectedBudgetVersion: offerBudget.version,
          }),
        },
      );
      setOffers((current) => current.filter((candidate) => candidate !== offer));
      setNotice(
        'Copied independently. Changes to the budget copy will not alter its reusable source.',
      );
    } catch {
      setError('The reusable occurrence could not be copied.');
    }
  };

  const previewRemoval = async (item: ReusableItemView) => {
    try {
      const preview = await financeRequest<{
        outcome: string;
        dependentCounts: Record<string, number>;
      }>(`/finance/records/reusable-item/${item.id}/deletion-preview`);
      const copies = preview.dependentCounts.budgetItems ?? 0;
      setNotice(
        copies
          ? `Archive source; preserve ${copies} independent budget ${copies === 1 ? 'copy' : 'copies'}.`
          : `${preview.outcome} is available for this unreferenced item.`,
      );
    } catch {
      setError('The reusable item impact preview is unavailable.');
    }
  };

  return (
    <section className="finance-reusable-items">
      <header>
        <div>
          <h2>Reusable items</h2>
          <p>Plan recurring or future activity once, then copy only applicable occurrences.</p>
        </div>
        <div>
          <button onClick={onBack}>Back to budgets</button>
          <button onClick={() => setCreating(true)}>Create reusable item</button>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="finance-reusable-list">
        {items.map((item) => (
          <article key={item.id} aria-label={`${item.description} reusable item`}>
            <h3>{item.description}</h3>
            <p>{money(item.plannedAmountMinor, item.currency, item.currencyExponent)}</p>
            <p>{item.applicableDate ? `Future date ${item.applicableDate}` : 'Recurring plan'}</p>
            <button onClick={() => void previewRemoval(item)}>Preview reusable item removal</button>
          </article>
        ))}
      </div>
      <section aria-labelledby="future-offers-heading">
        <h3 id="future-offers-heading">Future offers</h3>
        <div>
          {budgets.map((budget) => (
            <button key={budget.id} onClick={() => void loadOffers(budget)}>
              {budget.name} offers
            </button>
          ))}
        </div>
        {offerBudget ? <p>Offered for {offerBudget.name}</p> : null}
        <div>
          {offers.map((offer) => (
            <article key={`${offer.reusableItemId}:${offer.occurrenceDate}`}>
              <h4>{offer.description}</h4>
              <p>
                {offer.occurrenceDate} ·{' '}
                {money(offer.plannedAmountMinor, offer.currency, offer.currencyExponent)}
              </p>
              <button onClick={() => void copy(offer)}>Copy {offer.description}</button>
            </article>
          ))}
        </div>
      </section>
      <TransactionMatches csrfToken={csrfToken} />
      {creating ? (
        <dialog open aria-label="Create reusable item">
          <form onSubmit={(event) => void save(event)}>
            <h2>Create reusable item</h2>
            <label>
              Reusable description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
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
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
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
                value={kind}
                onChange={(event) => setKind(event.target.value as 'debit' | 'credit')}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </label>
            <label>
              Schedule
              <select
                value={schedule}
                onChange={(event) => setSchedule(event.target.value as 'future' | 'recurring')}
              >
                <option value="future">One-time future item</option>
                <option value="recurring">Recurring item</option>
              </select>
            </label>
            {schedule === 'future' ? (
              <label>
                Applicable date
                <input
                  type="date"
                  value={applicableDate}
                  onChange={(event) => setApplicableDate(event.target.value)}
                  required
                />
              </label>
            ) : (
              <fieldset>
                <legend>Recurrence</legend>
                <label>
                  Every
                  <input
                    type="number"
                    min="1"
                    max="366"
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Recurrence unit
                  <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </label>
                <label>
                  Recurrence start
                  <input
                    type="date"
                    value={recurrenceStart}
                    onChange={(event) => setRecurrenceStart(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Recurrence end
                  <input
                    type="date"
                    value={recurrenceEnd}
                    onChange={(event) => setRecurrenceEnd(event.target.value)}
                  />
                </label>
              </fieldset>
            )}
            <label>
              Planned amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <div>
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit">Save reusable item</button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
