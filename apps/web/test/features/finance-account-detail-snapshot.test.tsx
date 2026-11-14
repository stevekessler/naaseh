// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => {
  const access = {
    read: vi.fn(),
    canRead: vi.fn(() => true),
  };
  return {
    access,
    request: vi.fn(),
    queue: vi.fn(),
    deviceKey: vi.fn(),
  };
});

vi.mock('@naaseh/domain', () => ({
  createUlid: () => '01J00000000000000000000009',
  digestDuplicateDecisions: vi.fn(async () => 'decision-digest'),
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  currentFinanceAccess: () => f.access,
  peekFinanceAccess: () => f.access,
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/db/finance-repository.js', () => ({ financeDeviceKey: f.deviceKey }));
vi.mock('../../src/features/finance/csv/csv-import.js', () => ({
  queueEncryptedCsvChunks: f.queue,
}));
vi.mock('../../src/features/finance/transactions/TransactionTable.js', () => ({
  TransactionTable: () => null,
}));
vi.mock('../../src/features/finance/csv/CsvImportWizard.js', () => ({
  CsvImportWizard: ({ onCommit }: { onCommit: (input: unknown) => Promise<void> }) => (
    <button
      onClick={() =>
        void onCommit({
          mappedRows: [{ ordinal: 1, description: 'Groceries', amountMinor: -1200 }],
          rows: [
            {
              ordinal: 1,
              transactedAt: '2026-11-12T00:00:00.000Z',
              description: 'Groceries',
              amountMinor: -1200,
              duplicateDisposition: 'not-suspected',
            },
          ],
          mapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            dateFormat: 'YYYY-MM-DD',
            amountMapping: { mode: 'signed', amountColumn: 'Amount' },
          },
          review: {
            decisions: () => [],
            summary: () => ({ suspected: 0, included: 0, excluded: 0, unresolved: 0 }),
          },
        })
      }
    >
      Commit synthetic CSV
    </button>
  ),
}));

import { FinanceAccountDetail } from '../../src/features/finance/accounts/FinanceAccountDetail.js';

const account = {
  id: '01J00000000000000000000001',
  friendlyName: 'Checking',
  organizationName: 'Bank',
  sourceName: 'Checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 12345,
  balanceAt: '2026-11-08T00:00:00Z',
  status: 'active',
  version: 7,
  scope: { type: 'owner' as const, ownerId: 'owner' },
};

function renderDetail(authorizeEdit: () => Promise<boolean>) {
  return render(
    <FinanceAccountDetail
      account={account}
      csrfToken="csrf"
      onPreviewRemoval={vi.fn()}
      onInspectSavedImports={vi.fn()}
      onPreviewSavedImport={vi.fn()}
      onCheckSavedDuplicates={vi.fn()}
      duplicateChoices={new Map()}
      onDuplicateChoice={vi.fn()}
      onSubmitSavedImport={vi.fn()}
      submittingSavedImport={false}
      savedImportMessage=""
      authorizeEdit={authorizeEdit}
      onChange={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  f.access.canRead.mockReturnValue(true);
  f.access.read.mockImplementation(async (read: (signal: AbortSignal) => unknown) =>
    read(new AbortController().signal),
  );
  f.request.mockResolvedValue({});
  f.queue.mockResolvedValue(1);
  f.deviceKey.mockResolvedValue({});
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(cleanup);

describe('retained account proof for CSV commits', () => {
  it('does not start an online commit after the source account snapshot is denied', async () => {
    const authorizeEdit = vi.fn(async () => false);
    const view = renderDetail(authorizeEdit);

    fireEvent.click(view.getByRole('button', { name: 'Commit synthetic CSV' }));

    await waitFor(() => expect(authorizeEdit).toHaveBeenCalledTimes(1));
    expect(f.request).not.toHaveBeenCalled();
    expect(f.queue).not.toHaveBeenCalled();
  });

  it('discards an online success response after the source account snapshot changes', async () => {
    const authorizeEdit = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const view = renderDetail(authorizeEdit);

    fireEvent.click(view.getByRole('button', { name: 'Commit synthetic CSV' }));

    await waitFor(() => expect(authorizeEdit).toHaveBeenCalledTimes(2));
    expect(f.request).toHaveBeenCalledWith(
      `/finance/accounts/${account.id}/csv-imports`,
      expect.objectContaining({ method: 'POST', csrfToken: 'csrf' }),
    );
    expect(view.queryByText('CSV import committed.')).toBeNull();
  });

  it('publishes an online success only after re-verifying the source account snapshot', async () => {
    const authorizeEdit = vi.fn(async () => true);
    const view = renderDetail(authorizeEdit);

    fireEvent.click(view.getByRole('button', { name: 'Commit synthetic CSV' }));

    await view.findByText('CSV import committed.');
    expect(authorizeEdit).toHaveBeenCalledTimes(2);
  });

  it('keeps offline rows queued but suppresses stale success after the source account changes', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const authorizeEdit = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const view = renderDetail(authorizeEdit);

    fireEvent.click(view.getByRole('button', { name: 'Commit synthetic CSV' }));

    await waitFor(() => expect(authorizeEdit).toHaveBeenCalledTimes(2));
    expect(f.queue).toHaveBeenCalledTimes(1);
    expect(f.request).not.toHaveBeenCalled();
    expect(view.queryByText('CSV import queued securely for synchronization.')).toBeNull();
  });

  it('publishes offline queue success only after re-verifying the source account snapshot', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const authorizeEdit = vi.fn(async () => true);
    const view = renderDetail(authorizeEdit);

    fireEvent.click(view.getByRole('button', { name: 'Commit synthetic CSV' }));

    await view.findByText('CSV import queued securely for synchronization.');
    expect(authorizeEdit).toHaveBeenCalledTimes(2);
    expect(f.queue).toHaveBeenCalledTimes(1);
  });
});
