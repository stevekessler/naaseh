import { FormEvent, useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { FinanceMerchantDetail, type MerchantView } from './FinanceMerchantDetail.js';

export function FinanceMerchantPage({
  userId,
  isAdmin,
  csrfToken,
  initialMerchantId,
}: {
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  initialMerchantId?: string;
}) {
  const [merchants, setMerchants] = useState<MerchantView[]>([]);
  const [selectedId, setSelectedId] = useState(initialMerchantId);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  useEffect(() => {
    void financeRequest<{ items: MerchantView[] }>('/finance/merchants').then(({ items }) =>
      setMerchants(items),
    );
  }, []);
  useEffect(() => setSelectedId(initialMerchantId), [initialMerchantId]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const merchant = await financeRequest<MerchantView>('/finance/merchants', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ name, ...(city ? { city } : {}), ...(region ? { region } : {}) }),
    });
    setMerchants((current) => [...current, merchant]);
    setSelectedId(merchant.id);
    setName('');
    setCity('');
    setRegion('');
  };
  return (
    <section>
      <h2>Merchants</h2>
      <p>
        Merchant names and locations are visible to every active user. Do not include private
        financial details.
      </p>
      <form onSubmit={(event) => void create(event)}>
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
        <button type="submit">Create merchant</button>
      </form>
      <ul>
        {merchants
          .filter(({ status }) => status === 'active')
          .map((merchant) => (
            <li key={merchant.id}>
              <button onClick={() => setSelectedId(merchant.id)}>{merchant.name}</button>
            </li>
          ))}
      </ul>
      {selectedId ? (
        <FinanceMerchantDetail
          merchantId={selectedId}
          userId={userId}
          isAdmin={isAdmin}
          csrfToken={csrfToken}
          onRemoved={() => {
            setMerchants((current) => current.filter(({ id }) => id !== selectedId));
            setSelectedId(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
