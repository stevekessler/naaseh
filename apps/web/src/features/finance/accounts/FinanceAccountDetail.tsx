import { FormEvent, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { CsvImportWizard } from '../csv/CsvImportWizard.js';
import { createUlid } from '@naaseh/domain';
import { financeDeviceKey } from '../../../db/finance-repository.js';
import { queueEncryptedCsvChunks } from '../csv/csv-import.js';
import type { DuplicateCandidate } from '../csv/csv-import.js';

export interface FinanceAccountView {
  id: string;
  friendlyName: string;
  organizationName: string;
  sourceName: string;
  currency: string;
  currencyExponent: number;
  currentBalanceMinor: number;
  balanceAt: string;
  status: string;
  version: number;
  connectionId?: string;
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
  freshness?: { lastUpdatedAt: string; stale: boolean };
  importStatus?: { status: string; completed: number; total: number };
  duplicateCandidates?: DuplicateCandidate[];
}

export function FinanceAccountDetail({
  account,
  csrfToken,
  onChange,
}: {
  account: FinanceAccountView;
  csrfToken: string;
  onChange: (account: FinanceAccountView) => void;
}) {
  const [friendlyName, setFriendlyName] = useState(account.friendlyName);
  const [balance, setBalance] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{
    outcome: string;
    dependentCounts: Record<string, number>;
    preservedRecordTypes: string[];
    confirmationToken: string;
  }>();
  const updateName = async (event: FormEvent) => {
    event.preventDefault();
    const updated = await financeRequest<FinanceAccountView>(`/finance/accounts/${account.id}`, {
      method: 'PATCH',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ expectedVersion: account.version, friendlyName }),
    });
    onChange(updated);
    setMessage('Account name updated.');
  };
  const recordBalance = async (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number(balance);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric * 10 ** account.currencyExponent)) {
      setMessage('Enter an exact balance.');
      return;
    }
    const result = await financeRequest<{ account: FinanceAccountView }>(
      `/finance/accounts/${account.id}/balances`,
      {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedAccountVersion: account.version,
          balanceMinor: Math.round(numeric * 10 ** account.currencyExponent),
          effectiveAt: new Date().toISOString(),
        }),
      },
    );
    onChange(result.account);
    setBalance('');
    setMessage('Balance recorded.');
  };
  const loadPreview = async () =>
    setPreview(await financeRequest(`/finance/records/account/${account.id}/deletion-preview`));
  const commitCsv = async (
    rows: Array<{
      ordinal: number;
      amountMinor: number;
      transactedAt: string;
      description: string;
    }> = [],
  ) => {
    const batchId = createUlid();
    if (!navigator.onLine) {
      const scopeKey =
        account.scope?.type === 'group'
          ? `GROUP#${account.scope.groupId}`
          : account.scope?.type === 'owner'
            ? `OWNER#${account.scope.ownerId}`
            : 'OWNER#LOCAL';
      await queueEncryptedCsvChunks({
        accountId: account.id,
        batchId,
        scopeKey,
        rows,
        key: await financeDeviceKey(),
      });
      setMessage('CSV import queued securely for synchronization.');
      return;
    }
    const digest = async (value: string) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    await financeRequest(`/finance/accounts/${account.id}/csv-imports`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        batchId,
        fileDigest: await digest(JSON.stringify(rows)),
        mapping: {
          dateColumn: 'Date',
          descriptionColumn: 'Description',
          dateFormat: 'YYYY-MM-DD',
          amountMapping: { mode: 'signed', amountColumn: 'Amount' },
        },
        duplicateDecisionDigest: await digest('[]'),
        duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
        chunkIndex: 0,
        finalChunk: true,
        rows: rows.map((row) => ({ ...row, duplicateDisposition: 'not-suspected' })),
      }),
    });
    setMessage('CSV import committed.');
  };
  return (
    <article className="finance-account-detail">
      <h2>{account.friendlyName}</h2>
      <dl>
        <dt>Organization</dt>
        <dd>{account.organizationName}</dd>
        <dt>Account</dt>
        <dd>{account.sourceName}</dd>
        <dt>Balance recorded</dt>
        <dd>{new Date(account.balanceAt).toLocaleString()}</dd>
        <dt>Freshness</dt>
        <dd>{account.freshness?.stale ? 'Refresh recommended' : 'Up to date'}</dd>
      </dl>
      {account.importStatus ? (
        <p role="status">
          Import {account.importStatus.status}: {account.importStatus.completed} of{' '}
          {account.importStatus.total}
        </p>
      ) : null}
      <form onSubmit={(event) => void updateName(event)}>
        <label>
          Friendly name
          <input value={friendlyName} onChange={(event) => setFriendlyName(event.target.value)} />
        </label>
        <button type="submit">Save account name</button>
      </form>
      {!account.connectionId ? (
        <form onSubmit={(event) => void recordBalance(event)}>
          <label>
            New balance
            <input
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
            />
          </label>
          <button type="submit">Record balance</button>
        </form>
      ) : null}
      <button onClick={() => void loadPreview()}>Preview account removal</button>
      {preview ? (
        <section aria-label="Account removal impact">
          <strong>
            {preview.outcome === 'permanent-delete'
              ? 'Permanently delete'
              : preview.outcome === 'tombstone'
                ? 'Keep an audit tombstone'
                : 'Archive account'}
          </strong>
          <p>
            {Object.values(preview.dependentCounts).reduce((sum, count) => sum + count, 0)} visible
            dependent records.
          </p>
          {preview.preservedRecordTypes.length ? (
            <p>Preserved: {preview.preservedRecordTypes.join(', ')}</p>
          ) : null}
        </section>
      ) : null}
      {!account.connectionId ? (
        <CsvImportWizard
          currency={account.currency}
          duplicates={account.duplicateCandidates ?? []}
          onCommit={commitCsv}
        />
      ) : null}
      <p role="status">{message}</p>
    </article>
  );
}
