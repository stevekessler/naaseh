// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/features/finance/catalog/use-catalog-removal-preview.js', () => ({
  useCatalogRemovalPreview: () => ({
    pending: false,
    preview: undefined,
    load: vi.fn(),
    confirm: vi.fn(),
  }),
}));
vi.mock('../../src/features/finance/catalog/FinanceMerchantDetail.js', () => ({
  FinanceMerchantDetail: ({ merchantId }: { merchantId: string }) => (
    <p>Canonical merchant {merchantId}</p>
  ),
}));

import { FinanceCategoryManager } from '../../src/features/finance/catalog/FinanceCategoryManager.js';
import { FinanceMerchantPage } from '../../src/features/finance/catalog/FinanceMerchantPage.js';

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('catalog writes publish canonical reads', () => {
  it('ignores a category creation response and renders only the refreshed catalogue', async () => {
    const original = {
      id: 'category-old',
      name: 'Old category',
      origin: 'user',
      creatorId: 'owner',
      status: 'active',
      version: 1,
    };
    const canonical = { ...original, id: 'category-new', name: 'Canonical category' };
    f.request
      .mockResolvedValueOnce({ items: [original] })
      .mockResolvedValueOnce({ items: [original] })
      .mockResolvedValueOnce({ id: 'private-reply', name: 'Unverified private response' })
      .mockResolvedValueOnce({ items: [original, canonical] });
    const view = render(<FinanceCategoryManager userId="owner" isAdmin={false} csrfToken="csrf" />);
    await view.findByText('Old category');
    fireEvent.change(view.getByLabelText('Category name'), {
      target: { value: 'Requested category' },
    });
    fireEvent.submit(view.getByRole('button', { name: 'Create category' }).closest('form')!);
    await view.findByText('Canonical category');
    expect(view.queryByText('Unverified private response')).toBeNull();
  });

  it('rechecks category version and refreshes after rename instead of rendering the reply', async () => {
    const original = {
      id: 'category-one',
      name: 'Original',
      origin: 'user',
      creatorId: 'owner',
      status: 'active',
      version: 1,
    };
    f.request
      .mockResolvedValueOnce({ items: [original] })
      .mockResolvedValueOnce({ items: [original] })
      .mockResolvedValueOnce({ ...original, name: 'Unverified rename', version: 2 })
      .mockResolvedValueOnce({ items: [{ ...original, name: 'Canonical rename', version: 2 }] });
    const view = render(<FinanceCategoryManager userId="owner" isAdmin={false} csrfToken="csrf" />);
    const input = (await view.findByLabelText('Rename Original')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Requested rename' } });
    fireEvent.blur(input);
    await view.findByText('Canonical rename');
    expect(view.queryByText('Unverified rename')).toBeNull();
    expect(f.request.mock.calls[2]![1]).toMatchObject({ method: 'PATCH' });
  });

  it('selects a newly created merchant only after the canonical catalogue contains it', async () => {
    const canonical = {
      id: 'merchant-new',
      name: 'Requested merchant',
      city: 'Denver',
      region: 'CO',
      source: 'manual',
      status: 'active',
      version: 1,
    };
    f.request
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ id: 'private-reply', name: 'Unverified private response' })
      .mockResolvedValueOnce({ items: [canonical] });
    const view = render(<FinanceMerchantPage userId="owner" isAdmin={false} csrfToken="csrf" />);
    await waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    fireEvent.change(view.getByLabelText('Merchant name'), {
      target: { value: 'Requested merchant' },
    });
    fireEvent.change(view.getByLabelText('City'), { target: { value: 'Denver' } });
    fireEvent.change(view.getByLabelText('State or region'), { target: { value: 'CO' } });
    fireEvent.submit(view.getByRole('button', { name: 'Create merchant' }).closest('form')!);
    await view.findByText('Canonical merchant merchant-new');
    expect(view.queryByText('Unverified private response')).toBeNull();
  });
});
