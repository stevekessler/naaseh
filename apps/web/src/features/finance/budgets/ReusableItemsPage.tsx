import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { createUlid, type GroupView } from '@naaseh/domain';
import { queueEncryptedReusableItemMutation } from '../../../db/finance-repository.js';
import type { BudgetDetailView } from './FinanceBudgetDetail.js';
import { TransactionMatches } from './TransactionMatches.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
  type FinanceSnapshotRequest,
} from '../../../sync/finance-api-snapshot.js';

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

interface OfferSnapshot {
  budget: BudgetDetailView;
  offers: OfferView[];
}
interface RemovalPreview {
  outcome: string;
  dependentCounts: Record<string, number>;
}
type SnapshotSlot<T> = { current: FinanceApiSnapshot<T> | undefined };
function dropSnapshot<T>(slot: SnapshotSlot<T>) {
  if (slot.current) disposeFinanceApiSnapshot(slot.current);
  slot.current = undefined;
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
  groups,
  accounts,
  categories,
  csrfToken,
  onBack,
}: {
  budgets: BudgetDetailView[];
  groups: GroupView[];
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

  const [ready, setReady] = useState(false),
    [pending, setPending] = useState(false);
  const visit = useRef(0),
    serial = useRef(0);
  const itemSnapshot = useRef<FinanceApiSnapshot<ReusableItemView[]> | undefined>(undefined);
  const offerSnapshot = useRef<FinanceApiSnapshot<OfferSnapshot> | undefined>(undefined);
  const previewSnapshot = useRef<FinanceApiSnapshot<RemovalPreview> | undefined>(undefined);
  const clearSnapshot = useCallback(() => {
    visit.current++;
    serial.current++;
    dropSnapshot(itemSnapshot);
    dropSnapshot(offerSnapshot);
    dropSnapshot(previewSnapshot);
    setItems([]);
    setOffers([]);
    setOfferBudget(undefined);
    setReady(false);
    setPending(false);
    setCreating(false);
    setDescription('');
    setGroupId('');
    setCategoryId('');
    setAmount('');
    setApplicableDate('');
    setKind('debit');
    setSchedule('future');
    setInterval('1');
    setUnit('month');
    setRecurrenceStart('');
    setRecurrenceEnd('');
    setNotice('');
    setError('Refresh Finance to view reusable items.');
  }, []);
  const loadView = useCallback(
    async <T,>(
      load: (request: FinanceSnapshotRequest) => Promise<T>,
      slot: SnapshotSlot<T>,
      publish: (value: T) => void,
    ) => {
      const current = visit.current,
        requestSerial = ++serial.current;
      const currentRequest = () => current === visit.current && requestSerial === serial.current;
      setPending(true);
      setError('');
      let retained: FinanceApiSnapshot<T> | undefined;
      try {
        retained = await loadFinanceApiSnapshot(load);
        if (!currentRequest()) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        const value = await readFinanceApiSnapshot(retained, (value) => value);
        if (!currentRequest()) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        dropSnapshot(slot);
        slot.current = retained;
        publish(value);
        setPending(false);
        return true;
      } catch {
        if (retained) disposeFinanceApiSnapshot(retained);
        if (currentRequest()) clearSnapshot();
        return false;
      }
    },
    [clearSnapshot],
  );
  const refreshItems = useCallback(
    () =>
      loadView(
        async (request) =>
          (await request<{ items: ReusableItemView[] }>('/finance/reusable-items')).items,
        itemSnapshot,
        (values) => {
          dropSnapshot(offerSnapshot);
          dropSnapshot(previewSnapshot);
          setItems(values);
          setOffers([]);
          setOfferBudget(undefined);
          setNotice('');
          setReady(true);
        },
      ),
    [loadView],
  );
  useEffect(() => {
    clearSnapshot();
    const unsubscribe = peekFinanceAccess()?.onLock(clearSnapshot);
    void refreshItems();
    return () => {
      unsubscribe?.();
      visit.current++;
      serial.current++;
      dropSnapshot(itemSnapshot);
      dropSnapshot(offerSnapshot);
      dropSnapshot(previewSnapshot);
    };
  }, [clearSnapshot, refreshItems]);
  const checkItems = async (item?: ReusableItemView) => {
    const retained = itemSnapshot.current,
      current = visit.current,
      requestSerial = serial.current;
    if (!retained) return false;
    try {
      const allowed = await readFinanceApiSnapshot(
        retained,
        (values) =>
          !item || values.some((value) => value.id === item.id && value.version === item.version),
      );
      return (
        allowed &&
        current === visit.current &&
        requestSerial === serial.current &&
        retained === itemSnapshot.current
      );
    } catch {
      if (current === visit.current && requestSerial === serial.current) clearSnapshot();
      return false;
    }
  };
  const openCreate = async () => {
    const current = visit.current;
    if ((await checkItems()) && current === visit.current) {
      setCategoryId(categories[0]?.id ?? '');
      setCreating(true);
      setNotice('');
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    const current = visit.current;
    if (!(await checkItems()) || current !== visit.current) {
      if (current === visit.current) setPending(false);
      return;
    }
    const major = Number(amount);
    if (!Number.isFinite(major) || major <= 0 || !Number.isInteger(major * 100)) {
      setPending(false);
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
      plannedAmountMinor: Math.round(major * 100) * (kind === 'debit' ? -1 : 1),
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
      await financeRequest<ReusableItemView>('/finance/reusable-items', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify(value),
      });
      if (current !== visit.current) return;
      if ((await refreshItems()) && current === visit.current) {
        setCreating(false);
        setDescription('');
        setAmount('');
      }
    } catch {
      if (current !== visit.current) return;
      if (!navigator.onLine) {
        const entityId = createUlid();
        try {
          if (!(await checkItems()) || current !== visit.current) return;
          await queueEncryptedReusableItemMutation({
            entityId,
            scopeKey: `GROUP#${groupId}`,
            baseVersion: 0,
            value: { id: entityId, ...value, creatorId: 'pending', status: 'active', version: 1 },
          });
          if (!(await checkItems()) || current !== visit.current) return;
          setPending(false);
          setCreating(false);
          setNotice('Reusable item queued securely and will sync when online.');
        } catch {
          if (current === visit.current) {
            setPending(false);
            setError('The reusable item could not be queued securely.');
          }
        }
      } else {
        setPending(false);
        setError('The reusable item could not be saved.');
      }
    }
  };

  const loadOffers = async (budgetId: string) => {
    const current = visit.current;
    if (!(await checkItems()) || current !== visit.current) return;
    setNotice('');
    await loadView(
      async (request) => {
        const [budget, page] = await Promise.all([
          request<BudgetDetailView>(`/finance/budgets/${encodeURIComponent(budgetId)}`),
          request<{ items: OfferView[] }>(
            `/finance/budgets/${encodeURIComponent(budgetId)}/reusable-offers`,
          ),
        ]);
        return { budget, offers: page.items };
      },
      offerSnapshot,
      (value) => {
        setOfferBudget(value.budget);
        setOffers(value.offers);
      },
    );
  };
  const copy = async (offer: OfferView) => {
    const retained = offerSnapshot.current,
      current = visit.current,
      requestSerial = serial.current;
    if (!retained) return;
    setPending(true);
    setError('');
    try {
      const value = await readFinanceApiSnapshot(retained, (value) => ({
        budget: value.budget,
        offer: value.offers.find(
          (candidate) =>
            candidate.reusableItemId === offer.reusableItemId &&
            candidate.occurrenceDate === offer.occurrenceDate,
        ),
      }));
      if (
        current !== visit.current ||
        requestSerial !== serial.current ||
        retained !== offerSnapshot.current
      )
        return;
      if (!value.offer) {
        setPending(false);
        return;
      }
      await financeRequest(
        `/finance/budgets/${value.budget.id}/reusable-items/${value.offer.reusableItemId}/copy`,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            occurrenceDate: value.offer.occurrenceDate,
            expectedBudgetVersion: value.budget.version,
          }),
        },
      );
      if (current !== visit.current) return;
      await loadOffers(value.budget.id);
      if (current === visit.current)
        setNotice(
          'Copied independently. Changes to the budget copy will not alter its reusable source.',
        );
    } catch {
      if (current === visit.current) {
        clearSnapshot();
        setError('The reusable occurrence could not be copied. Refresh Finance before retrying.');
      }
    }
  };
  const previewRemoval = async (item: ReusableItemView) => {
    const current = visit.current;
    if (!(await checkItems(item)) || current !== visit.current) return;
    await loadView(
      (request) =>
        request<RemovalPreview>(`/finance/records/reusable-item/${item.id}/deletion-preview`),
      previewSnapshot,
      (preview) => {
        const copies = preview.dependentCounts.budgetItems ?? 0;
        setNotice(
          copies
            ? `Archive source; preserve ${copies} independent budget ${copies === 1 ? 'copy' : 'copies'}.`
            : `${preview.outcome} is available for this unreferenced item.`,
        );
      },
    );
  };
  if (!ready)
    return (
      <section className="finance-reusable-items">
        <h2>Reusable items</h2>
        <button onClick={onBack}>Back to budgets</button>
        <button disabled={pending} onClick={() => void refreshItems()}>
          {pending ? 'Checking reusable items…' : 'Refresh reusable items'}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );

  return (
    <section className="finance-reusable-items">
      <header>
        <div>
          <h2>Reusable items</h2>
          <p>Plan recurring or future activity once, then copy only applicable occurrences.</p>
        </div>
        <div>
          <button onClick={onBack}>Back to budgets</button>
          <button disabled={pending} onClick={() => void openCreate()}>
            Create reusable item
          </button>
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
            <button disabled={pending} onClick={() => void previewRemoval(item)}>
              Preview reusable item removal
            </button>
          </article>
        ))}
      </div>
      <section aria-labelledby="future-offers-heading">
        <h3 id="future-offers-heading">Future offers</h3>
        <div>
          {budgets.map((budget) => (
            <button key={budget.id} disabled={pending} onClick={() => void loadOffers(budget.id)}>
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
              <button disabled={pending} onClick={() => void copy(offer)}>
                Copy {offer.description}
              </button>
            </article>
          ))}
        </div>
      </section>
      <TransactionMatches key={visit.current} csrfToken={csrfToken} />
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
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
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
              <button type="submit" disabled={pending}>
                Save reusable item
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
