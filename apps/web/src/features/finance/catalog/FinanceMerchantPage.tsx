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
  const refresh = async () => {
    const { items } = await financeRequest<{ items: MerchantView[] }>('/finance/merchants');
    setMerchants(items);
    return items;
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => setSelectedId(initialMerchantId), [initialMerchantId]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const before = new Set((await refresh()).map(({ id }) => id));
    await financeRequest('/finance/merchants', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ name, ...(city ? { city } : {}), ...(region ? { region } : {}) }),
    });
    const current = await refresh();
    const created = current.filter(
      (merchant) =>
        !before.has(merchant.id) &&
        merchant.name === name &&
        (merchant.city ?? '') === city &&
        (merchant.region ?? '') === region,
    );
    setSelectedId(created.length === 1 ? created[0]!.id : undefined);
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
