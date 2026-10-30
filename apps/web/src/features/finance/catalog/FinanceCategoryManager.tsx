import { FormEvent, useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';

type CategoryView = {
  id: string;
  name: string;
  origin: 'bank' | 'user';
  creatorId?: string;
  status: 'active' | 'archived';
  version: number;
};
type DeletionPreview = {
  expectedVersion: number;
  outcome: 'archive' | 'permanent-delete' | 'tombstone';
  confirmationToken: string;
  dependentCounts: Record<string, number>;
};

export function FinanceCategoryManager({
  userId,
  isAdmin,
  csrfToken,
}: {
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
}) {
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [previews, setPreviews] = useState<Record<string, DeletionPreview>>({});
  useEffect(() => {
    void financeRequest<{ items: CategoryView[] }>('/finance/categories').then(({ items }) =>
      setCategories(items),
    );
  }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const category = await financeRequest<CategoryView>('/finance/categories', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ name }),
    });
    setCategories((current) => [...current, category]);
    setName('');
    setMessage('Category created.');
  };
  const rename = async (category: CategoryView, nextName: string) => {
    const updated = await financeRequest<CategoryView>(`/finance/categories/${category.id}`, {
      method: 'PATCH',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ expectedVersion: category.version, name: nextName }),
    });
    setCategories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMessage('Category renamed.');
  };
  const preview = async (category: CategoryView) => {
    const value = await financeRequest<DeletionPreview>(
      `/finance/records/category/${category.id}/deletion-preview`,
    );
    setPreviews((current) => ({ ...current, [category.id]: value }));
  };
  const confirm = async (category: CategoryView) => {
    const value = previews[category.id];
    if (!value) return;
    await financeRequest(`/finance/records/category/${category.id}/deletion`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        expectedVersion: value.expectedVersion,
        confirmationToken: value.confirmationToken,
      }),
    });
    setCategories((current) =>
      value.outcome === 'permanent-delete'
        ? current.filter(({ id }) => id !== category.id)
        : current.map((item) =>
            item.id === category.id
              ? { ...item, status: 'archived', version: item.version + 1 }
              : item,
          ),
    );
    setMessage(value.outcome === 'permanent-delete' ? 'Category removed.' : 'Category archived.');
  };
  return (
    <section>
      <h2>Categories</h2>
      <p>
        Category names are visible to every active user. Do not include private financial details.
      </p>
      <form onSubmit={(event) => void create(event)}>
        <label>
          Category name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit">Create category</button>
      </form>
      <ul>
        {categories.map((category) => {
          const canManage =
            category.origin === 'user' && (isAdmin || category.creatorId === userId);
          return (
            <li key={category.id}>
              <span>
                {category.name}
                {category.status === 'archived' ? ' (archived)' : ''}
              </span>
              {canManage && category.status === 'active' ? (
                <>
                  <label>
                    Rename {category.name}
                    <input
                      defaultValue={category.name}
                      onBlur={(event) => {
                        if (event.target.value !== category.name)
                          void rename(category, event.target.value);
                      }}
                    />
                  </label>
                  <button onClick={() => void preview(category)}>Review category removal</button>
                  {previews[category.id] ? (
                    <button onClick={() => void confirm(category)}>
                      {previews[category.id]!.outcome === 'permanent-delete'
                        ? 'Remove mistaken category'
                        : 'Archive category'}
                    </button>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
