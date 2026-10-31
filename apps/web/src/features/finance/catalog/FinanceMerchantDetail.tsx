import { useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import type { TransactionView } from '../transactions/TransactionDetail.js';

export type MerchantView = {
  id: string;
  name: string;
  city?: string;
  region?: string;
  creatorId?: string;
  source: 'imported' | 'manual' | 'merged';
  status: 'active' | 'archived' | 'merged';
  version: number;
};
type MerchantActivity = {
  merchant: MerchantView;
  transactions: TransactionView[];
  totalsComplete: true;
};
type DeletionPreview = {
  expectedVersion: number;
  outcome: 'archive' | 'permanent-delete' | 'tombstone';
  confirmationToken: string;
};

export function FinanceMerchantDetail({
  merchantId,
  userId,
  isAdmin,
  csrfToken,
  onRemoved,
}: {
  merchantId: string;
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  onRemoved: () => void;
}) {
  const [activity, setActivity] = useState<MerchantActivity>();
  const [preview, setPreview] = useState<DeletionPreview>();
  const [message, setMessage] = useState('');
  useEffect(() => {
    void financeRequest<MerchantActivity>(`/finance/merchants/${merchantId}`).then(setActivity);
  }, [merchantId]);
  if (!activity) return <p role="status">Loading merchant…</p>;
  const { merchant, transactions } = activity;
  const canManage = isAdmin || merchant.creatorId === userId;
  const loadPreview = async () =>
    setPreview(await financeRequest(`/finance/records/merchant/${merchant.id}/deletion-preview`));
  const confirm = async () => {
    if (!preview) return;
    await financeRequest(`/finance/records/merchant/${merchant.id}/deletion`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        expectedVersion: preview.expectedVersion,
        confirmationToken: preview.confirmationToken,
      }),
    });
    setMessage(preview.outcome === 'permanent-delete' ? 'Merchant removed.' : 'Merchant archived.');
    onRemoved();
  };
  return (
    <article>
      <h2>{merchant.name}</h2>
      <p>{[merchant.city, merchant.region].filter(Boolean).join(', ') || 'No location provided'}</p>
      {canManage && merchant.status === 'active' ? (
        <div>
          <button onClick={() => void loadPreview()}>Review merchant removal</button>
          {preview ? (
            <button onClick={() => void confirm()}>
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
