import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatalogRemovalPreview } from './use-catalog-removal-preview.js';
import type { TransactionView } from '../transactions/TransactionDetail.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import { financeRequest } from '../finance-client.js';
import {
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  disposeFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

export type MerchantView = {
  id: string;
  name: string;
  city?: string;
  region?: string;
  creatorId?: string;
  financeCategoryId?: string;
  source: 'imported' | 'manual' | 'merged';
  status: 'active' | 'archived' | 'merged';
  version: number;
};
type MerchantActivity = {
  merchant: MerchantView;
  transactions: TransactionView[];
  totalsComplete: true;
};
type MerchantDetailProps = {
  merchantId: string;
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  onRemoved: () => void;
};

export function FinanceMerchantDetail(props: MerchantDetailProps) {
  return (
    <MerchantDetailContent key={JSON.stringify([props.userId, props.merchantId])} {...props} />
  );
}

function MerchantDetailContent({
  merchantId,
  userId,
  isAdmin,
  csrfToken,
  onRemoved,
}: MerchantDetailProps) {
  const [activity, setActivity] = useState<MerchantActivity>();
  const removal = useCatalogRemovalPreview('merchant', userId, csrfToken);
  const { preview, clear: clearPreview } = removal;
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [financeCategoryId, setFinanceCategoryId] = useState('');
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; parentId?: string; status: 'active' | 'archived' }>
  >([]);
  const snapshot = useRef<FinanceApiSnapshot<MerchantActivity> | undefined>(undefined);
  const serial = useRef(0);
  const clearSnapshot = useCallback(() => {
    serial.current++;
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    snapshot.current = undefined;
    setActivity(undefined);
    clearPreview();
    setChecking(false);
    setMessage('Reconnect and refresh Finance to view merchant activity.');
  }, [clearPreview]);
  useEffect(() => {
    const current = ++serial.current;
    let retained: FinanceApiSnapshot<MerchantActivity> | undefined;
    setActivity(undefined);
    clearPreview();
    setMessage('');
    setChecking(true);
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    snapshot.current = undefined;
    const unsubscribe = peekFinanceAccess()?.onLock(clearSnapshot);
    void (async () => {
      retained = await loadFinanceApiSnapshot((request) =>
        request<MerchantActivity>(`/finance/merchants/${merchantId}`),
      );
      if (current !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      const value = await readFinanceApiSnapshot(retained, (value) => value);
      if (current !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      snapshot.current = retained;
      setActivity(value);
      setName(value.merchant.name);
      setCity(value.merchant.city ?? '');
      setRegion(value.merchant.region ?? '');
      setFinanceCategoryId(value.merchant.financeCategoryId ?? '');
      setChecking(false);
    })().catch(() => {
      if (retained) disposeFinanceApiSnapshot(retained);
      if (current === serial.current) clearSnapshot();
    });
    return () => {
      serial.current++;
      unsubscribe?.();
      if (retained) disposeFinanceApiSnapshot(retained);
      if (snapshot.current === retained) snapshot.current = undefined;
    };
  }, [merchantId, reload, clearSnapshot, clearPreview]);
  const readCurrent = async () => {
    const token = snapshot.current,
      current = serial.current;
    if (
      !token ||
      !(await readFinanceApiSnapshot(token, (value) => value.merchant.id === merchantId)) ||
      current !== serial.current
    )
      throw new Error('Refresh merchant activity.');
    return { token, current };
  };
  if (!activity)
    return (
      <section>
        <p role="status">{checking ? 'Loading merchant…' : message}</p>
        <button disabled={checking} onClick={() => setReload((value) => value + 1)}>
          Refresh merchant activity
        </button>
      </section>
    );
  const { merchant, transactions } = activity;
  const canManage = isAdmin || merchant.creatorId === userId;
  const loadPreview = async () => {
    const current = serial.current;
    try {
      await readCurrent();
      if (!(await removal.load(merchant.id)) && current === serial.current) clearSnapshot();
    } catch {
      if (current === serial.current) clearSnapshot();
    }
  };
  const confirm = async () => {
    if (!preview) return;
    const current = serial.current;
    try {
      await readCurrent();
      const outcome = await removal.confirm(merchant.id);
      if (!outcome) throw new Error('Refresh merchant removal preview.');
      if (current === serial.current) {
        clearSnapshot();
        setMessage(outcome === 'permanent-delete' ? 'Merchant removed.' : 'Merchant archived.');
        onRemoved();
      }
    } catch {
      if (current === serial.current) clearSnapshot();
    }
  };
  const save = async () => {
    const current = serial.current;
    try {
      await readCurrent();
      await financeRequest(`/finance/merchants/${merchant.id}`, {
        method: 'PATCH',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedVersion: merchant.version,
          name,
          city: city.trim() || null,
          region: region.trim() || null,
          financeCategoryId: financeCategoryId || null,
        }),
      });
      if (current === serial.current) {
        setEditing(false);
        setMessage('Merchant updated.');
        setReload((value) => value + 1);
      }
    } catch {
      if (current === serial.current)
        setMessage('Merchant could not be updated. Refresh and check for a catalog collision.');
    }
  };
  const toggleEditing = async () => {
    if (editing) {
      setEditing(false);
      return;
    }
    try {
      const page = await financeRequest<{
        items: Array<{
          id: string;
          name: string;
          parentId?: string;
          status: 'active' | 'archived';
        }>;
      }>('/finance/categories');
      setCategories(page.items);
      setEditing(true);
    } catch {
      setMessage('Categories could not be loaded for merchant editing.');
    }
  };
  return (
    <article>
      <h2>{merchant.name}</h2>
      <p>{[merchant.city, merchant.region].filter(Boolean).join(', ') || 'No location provided'}</p>
      {canManage && merchant.status === 'active' ? (
        <div>
          <button type="button" onClick={() => void toggleEditing()}>
            {editing ? 'Cancel merchant edit' : 'Edit merchant'}
          </button>
          {editing ? (
            <section aria-label="Edit merchant">
              <label>
                Merchant name
                <input required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                City
                <input value={city} onChange={(event) => setCity(event.target.value)} />
              </label>
              <label>
                State or region
                <input value={region} onChange={(event) => setRegion(event.target.value)} />
              </label>
              <label>
                Default category
                <select
                  value={financeCategoryId}
                  onChange={(event) => setFinanceCategoryId(event.target.value)}
                >
                  <option value="">No default category</option>
                  {categories
                    .filter(({ parentId, status }) => !parentId && status === 'active')
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <button type="button" disabled={!name.trim()} onClick={() => void save()}>
                Save merchant
              </button>
            </section>
          ) : null}
          <button disabled={removal.pending} onClick={() => void loadPreview()}>
            Review merchant removal
          </button>
          {preview ? (
            <button disabled={removal.pending} onClick={() => void confirm()}>
              {preview.outcome === 'permanent-delete'
                ? 'Remove mistaken merchant'
                : 'Archive merchant'}
            </button>
          ) : null}
        </div>
      ) : null}
      <section aria-label="Authorized merchant activity">
        <h3>Authorized merchant activity</h3>
        {transactions.length ? (
          transactions.map((transaction) => (
            <article key={transaction.id}>
              <h4>{transaction.description}</h4>
            </article>
          ))
        ) : (
          <p>No activity is available in your accessible accounts.</p>
        )}
      </section>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}
