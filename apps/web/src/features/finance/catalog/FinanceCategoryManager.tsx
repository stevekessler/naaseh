import {
  DashboardFlagControl,
  DashboardFlagStatus,
  useDashboardFlags,
} from '../dashboard/DashboardFlagControl.js';
import { FormEvent, useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { useCatalogRemovalPreview } from './use-catalog-removal-preview.js';

type CategoryView = {
  id: string;
  name: string;
  origin: 'bank' | 'user';
  creatorId?: string;
  parentId?: string;
  status: 'active' | 'archived';
  version: number;
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
  const dashboardFlags = useDashboardFlags(csrfToken);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [message, setMessage] = useState('');
  const removal = useCatalogRemovalPreview('category', userId, csrfToken);
  const refresh = async () => {
    const { items } = await financeRequest<{ items: CategoryView[] }>('/finance/categories');
    setCategories(items);
    return items;
  };
  useEffect(() => {
    void refresh();
  }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await refresh();
    await financeRequest('/finance/categories', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ name, ...(parentId ? { parentId } : {}) }),
    });
    await refresh();
    setName('');
    setParentId('');
    setMessage('Category created.');
  };
  const reparent = async (category: CategoryView, nextParentId: string) => {
    const current = (await refresh()).find(({ id }) => id === category.id);
    if (!current || current.version !== category.version) {
      setMessage('Category changed. Review the current value before moving it.');
      return;
    }
    try {
      await financeRequest(`/finance/categories/${category.id}`, {
        method: 'PATCH',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedVersion: category.version,
          parentId: nextParentId || null,
        }),
      });
      await refresh();
      setMessage('Category hierarchy updated.');
    } catch {
      setMessage('This category cannot be moved because its hierarchy or history would change.');
    }
  };
  const rename = async (category: CategoryView, nextName: string) => {
    const current = (await refresh()).find(({ id }) => id === category.id);
    if (!current || current.version !== category.version) {
      setMessage('Category changed. Review the current value before renaming.');
      return;
    }
    await financeRequest(`/finance/categories/${category.id}`, {
      method: 'PATCH',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ expectedVersion: category.version, name: nextName }),
    });
    await refresh();
    setMessage('Category renamed.');
  };
  const preview = async (category: CategoryView) => {
    if (!(await removal.load(category.id)))
      setMessage('Refresh Finance to review category removal.');
  };
  const confirm = async (category: CategoryView) => {
    const outcome = await removal.confirm(category.id);
    if (!outcome) {
      setMessage('Refresh Finance to review category removal.');
      return;
    }
    await refresh();
    setMessage(outcome === 'permanent-delete' ? 'Category removed.' : 'Category archived.');
  };
  return (
    <section>
      <h2>Categories</h2>
      <DashboardFlagStatus preferences={dashboardFlags} />
      <p>
        Category names are visible to every active user. Do not include private financial details.
      </p>
      <form onSubmit={(event) => void create(event)}>
        <label>
          Category name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Parent category
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">No parent (top level)</option>
            {categories
              .filter(({ parentId, status }) => !parentId && status === 'active')
              .map((category) => (
                <option key={category.id} value={category.id}>
                  Use as parent: {category.name}
                </option>
              ))}
          </select>
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
                {category.parentId
                  ? `${categories.find(({ id }) => id === category.parentId)?.name ?? 'Missing parent'} → ${category.name}`
                  : category.name}
                {category.status === 'archived' ? ' (archived)' : ''}
              </span>
              <DashboardFlagControl
                preferences={dashboardFlags}
                kind="category"
                id={category.id}
                name={category.name}
              />
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
                  <label>
                    Parent for {category.name}
                    <select
                      value={category.parentId ?? ''}
                      onChange={(event) => void reparent(category, event.target.value)}
                    >
                      <option value="">No parent (top level)</option>
                      {categories
                        .filter(
                          (candidate) =>
                            candidate.id !== category.id &&
                            !candidate.parentId &&
                            candidate.status === 'active',
                        )
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            Move under: {candidate.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button disabled={removal.pending} onClick={() => void preview(category)}>
                    Review category removal
                  </button>
                  {removal.preview?.recordId === category.id ? (
                    <button disabled={removal.pending} onClick={() => void confirm(category)}>
                      {removal.preview.outcome === 'permanent-delete'
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
