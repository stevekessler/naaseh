import {
  DashboardFlagControl,
  DashboardFlagStatus,
  useDashboardPreferences,
} from '../dashboard/DashboardFlagControl.js';
import { FormEvent, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { currentFinanceAccess, peekFinanceAccess } from '../security/finance-access.js';
import { CsvImportWizard, type ReviewedCsvImport } from '../csv/CsvImportWizard.js';
import { createUlid, digestDuplicateDecisions } from '@naaseh/domain';
import {
  financeDeviceKey,
  type SavedCsvImportSummary,
  type SavedCsvImportPreview,
  type SavedCsvPage,
} from '../../../db/finance-repository.js';
import { queueEncryptedCsvChunks, type CsvQueueReview } from '../csv/csv-import.js';
import type { DuplicateCandidate, DuplicateDecision } from '../csv/csv-import.js';
import { ManualTransactionForm } from '../transactions/ManualTransactionForm.js';

export interface FinanceAccountView {
  id: string;
  friendlyName: string;
  organizationName: string;
  sourceName: string;
  accountType?: string;
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

export type AccountRemovalImpact = {
  outcome: string;
  dependentCounts: Record<string, number>;
  preservedRecordTypes: string[];
};

export function FinanceAccountDetail({
  account,
  csrfToken,
  removalImpact,
  onPreviewRemoval,
  savedImports,
  onInspectSavedImports,
  savedImportPreview,
  onPreviewSavedImport,
  duplicateResult,
  onCheckSavedDuplicates,
  duplicateChoices,
  onDuplicateChoice,
  onSubmitSavedImport,
  submittingSavedImport,
  savedImportMessage,
  authorizeEdit,
  onChange,
}: {
  account: FinanceAccountView;
  csrfToken: string;
  removalImpact?: AccountRemovalImpact;
  onPreviewRemoval: () => Promise<void>;
  savedImports?: SavedCsvImportSummary[];
  onInspectSavedImports: () => Promise<void>;
  savedImportPreview?: SavedCsvImportPreview;
  onPreviewSavedImport: (batchId: string, page?: SavedCsvPage) => Promise<void>;
  duplicateResult?: number[] | string;
  onCheckSavedDuplicates: (batchId: string, page: SavedCsvPage) => Promise<void>;
  duplicateChoices: ReadonlyMap<number, DuplicateDecision>;
  onDuplicateChoice: (ordinal: number, decision: DuplicateDecision) => void;
  onSubmitSavedImport: (preview: SavedCsvImportPreview) => Promise<void>;
  submittingSavedImport: boolean;
  savedImportMessage: string;
  authorizeEdit: () => Promise<boolean>;
  onChange: () => Promise<boolean>;
}) {
  const dashboardFlags = useDashboardPreferences(csrfToken);
  const [friendlyName, setFriendlyName] = useState(account.friendlyName);
  const [balance, setBalance] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmedSavedBatch, setConfirmedSavedBatch] = useState<string>();
  const [addingTransaction, setAddingTransaction] = useState(false);
  const saveAccount = async (write: () => Promise<unknown>, success: () => void) => {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (!(await authorizeEdit())) return;
      await write();
      if (await onChange()) success();
    } catch {
      setMessage('The account could not be updated. Refresh accounts and try again.');
    } finally {
      setSaving(false);
    }
  };
  const updateName = async (event: FormEvent) => {
    event.preventDefault();
    await saveAccount(
      () =>
        financeRequest(`/finance/accounts/${account.id}`, {
          method: 'PATCH',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({ expectedVersion: account.version, friendlyName }),
        }),
      () => setMessage('Account name updated.'),
    );
  };
  const recordBalance = async (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number(balance);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric * 10 ** account.currencyExponent)) {
      setMessage('Enter an exact balance.');
      return;
    }
    await saveAccount(
      () =>
        financeRequest(`/finance/accounts/${account.id}/balances`, {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            expectedAccountVersion: account.version,
            balanceMinor: Math.round(numeric * 10 ** account.currencyExponent),
            effectiveAt: new Date().toISOString(),
          }),
        }),
      () => {
        setBalance('');
        setMessage('Balance recorded.');
      },
    );
  };
  const commitCsv = async ({ mappedRows, rows, mapping, review }: ReviewedCsvImport) => {
    const access = currentFinanceAccess();
    try {
      if (!(await authorizeEdit())) return;
      let queuedOffline = false;
      await access.read(async (signal) => {
        const batchId = createUlid();
        const digest = async (value: string) =>
          [
            ...new Uint8Array(
              await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
            ),
          ]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
        const decisions = review.decisions();
        const { suspected, included, excluded } = review.summary();
        const reviewEvidence: CsvQueueReview = {
          fileDigest: await digest(JSON.stringify(mappedRows)),
          mapping,
          duplicateDecisionDigest: await digestDuplicateDecisions(
            decisions.map(({ ordinal }) => ordinal),
            decisions,
          ),
          duplicateReviewSummary: { suspected, included, excluded, unresolved: 0 },
        };
        signal.throwIfAborted();
        if (!navigator.onLine) {
          const scopeKey =
            account.scope?.type === 'group'
              ? `GROUP#${account.scope.groupId}`
              : account.scope?.type === 'owner'
                ? `OWNER#${account.scope.ownerId}`
                : 'OWNER#LOCAL';
          const key = await financeDeviceKey();
          signal.throwIfAborted();
          await queueEncryptedCsvChunks({
            accountId: account.id,
            batchId,
            scopeKey,
            rows,
            key,
            review: reviewEvidence,
          });
          signal.throwIfAborted();
          queuedOffline = true;
          return;
        }
        await financeRequest(`/finance/accounts/${account.id}/csv-imports`, {
          method: 'POST',
          signal,
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            batchId,
            ...reviewEvidence,
            chunkIndex: 0,
            finalChunk: true,
            rows,
          }),
        });
        signal.throwIfAborted();
      });
      if (!(await authorizeEdit())) return;
      setMessage(
        queuedOffline ? 'CSV import queued securely for synchronization.' : 'CSV import committed.',
      );
    } catch {
      if (access === peekFinanceAccess() && access.canRead()) {
        setMessage('CSV import could not be completed. Refresh Finance and try again.');
      }
    }
  };
  return (
    <article className="finance-account-detail">
      <section className="finance-account-summary" aria-label="Account summary">
        <h2>{account.friendlyName}</h2>
        <DashboardFlagStatus preferences={dashboardFlags} />
        <DashboardFlagControl
          preferences={dashboardFlags}
          kind="account"
          id={account.id}
          name={account.friendlyName}
        />
        <dl>
          <dt>Organization</dt>
          <dd>{account.organizationName}</dd>
          <dt>Account</dt>
          <dd>{account.sourceName}</dd>
          <dt>Type</dt>
          <dd>
            {account.accountType ?? (account.connectionId ? 'Connected account' : 'Manual account')}
          </dd>
          <dt>Ownership</dt>
          <dd>
            {account.scope?.type === 'group'
              ? `Group ${account.scope.groupId}`
              : account.scope?.type === 'owner'
                ? 'Personal'
                : 'Current user'}
          </dd>
        </dl>
      </section>
      <section className="finance-account-balance" aria-label="Balance and freshness">
        <h3>Balance and freshness</h3>
        <dl>
          <dt>Current balance</dt>
          <dd>
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: account.currency,
              minimumFractionDigits: account.currencyExponent,
              maximumFractionDigits: account.currencyExponent,
            }).format(account.currentBalanceMinor / 10 ** account.currencyExponent)}
          </dd>
          <dt>Currency</dt>
          <dd>{account.currency}</dd>
          <dt>Balance recorded</dt>
          <dd>{new Date(account.balanceAt).toLocaleString()}</dd>
          <dt>Freshness</dt>
          <dd>{account.freshness?.stale ? 'Refresh recommended' : 'Up to date'}</dd>
        </dl>
      </section>
      {account.importStatus ? (
        <p role="status">
          Import {account.importStatus.status}: {account.importStatus.completed} of{' '}
          {account.importStatus.total}
        </p>
      ) : null}
      <section className="finance-account-settings" aria-label="Account settings">
        <h3>Account settings</h3>
        <form onSubmit={(event) => void updateName(event)}>
          <label>
            Friendly name
            <input value={friendlyName} onChange={(event) => setFriendlyName(event.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            Save account name
          </button>
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
            <button type="submit" disabled={saving}>
              Record balance
            </button>
          </form>
        ) : null}
      </section>
      <section
        className="finance-account-transactions"
        aria-label="Account transactions and imports"
      >
        <h3>Transactions and imports</h3>
        <button type="button" onClick={() => setAddingTransaction((value) => !value)}>
          Add Transaction
        </button>
        {addingTransaction ? (
          <ManualTransactionForm
            accounts={[account]}
            selectedAccountId={account.id}
            accountLocked
            csrfToken={csrfToken}
            authorizeEdit={authorizeEdit}
            onSaved={async (_transaction, queued) => {
              if (!queued) await onChange();
            }}
          />
        ) : null}
        {!account.connectionId ? (
          <CsvImportWizard
            currency={account.currency}
            duplicates={account.duplicateCandidates ?? []}
            onCommit={commitCsv}
          />
        ) : null}
        {!account.connectionId ? (
          <section aria-label="Saved CSV imports">
            <button onClick={() => void onInspectSavedImports()}>Check saved CSV imports</button>
            {savedImportMessage ? <p role="status">{savedImportMessage}</p> : null}
            {savedImports ? (
              savedImports.length ? (
                <>
                  <p>Destination account: {account.friendlyName}</p>
                  <ul>
                    {savedImports.map(({ batchId, rowCount, complete }) => (
                      <li key={batchId}>
                        {rowCount} saved {rowCount === 1 ? 'row' : 'rows'}
                        {complete ? '' : ' from an incomplete batch'}
                        <button onClick={() => void onPreviewSavedImport(batchId)}>
                          Preview saved rows
                        </button>
                      </li>
                    ))}
                  </ul>
                  {savedImportPreview ? (
                    <section aria-label="Saved CSV rows">
                      <p>
                        Rows {savedImportPreview.offset + 1}–
                        {savedImportPreview.offset + savedImportPreview.rows.length} of{' '}
                        {savedImportPreview.rowCount}.
                      </p>
                      <label>
                        Saved rows per page
                        <select
                          value={savedImportPreview.limit}
                          onChange={(event) =>
                            void onPreviewSavedImport(savedImportPreview.batchId, {
                              offset: 0,
                              limit: Number(event.target.value),
                            })
                          }
                        >
                          {[1, 10, 25, 100].map((limit) => (
                            <option key={limit} value={limit}>
                              {limit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        disabled={savedImportPreview.offset === 0}
                        onClick={() =>
                          void onPreviewSavedImport(savedImportPreview.batchId, {
                            offset: Math.max(
                              0,
                              savedImportPreview.offset - savedImportPreview.limit,
                            ),
                            limit: savedImportPreview.limit,
                          })
                        }
                      >
                        Previous saved rows
                      </button>
                      <button
                        disabled={
                          savedImportPreview.offset + savedImportPreview.rows.length >=
                          savedImportPreview.rowCount
                        }
                        onClick={() =>
                          void onPreviewSavedImport(savedImportPreview.batchId, {
                            offset: savedImportPreview.offset + savedImportPreview.limit,
                            limit: savedImportPreview.limit,
                          })
                        }
                      >
                        Next saved rows
                      </button>
                      <button
                        disabled={savedImportPreview.submissionPending}
                        onClick={() =>
                          void onCheckSavedDuplicates(savedImportPreview.batchId, {
                            offset: savedImportPreview.offset,
                            limit: savedImportPreview.limit,
                          })
                        }
                      >
                        Check displayed rows for duplicates
                      </button>
                      {typeof duplicateResult === 'string' ? (
                        <p role="status">{duplicateResult}</p>
                      ) : null}
                      {Array.isArray(duplicateResult) && duplicateResult.length === 0 ? (
                        <p role="status">No possible duplicates for the displayed rows.</p>
                      ) : null}
                      <ul>
                        {savedImportPreview.rows.map((row) => (
                          <li key={row.ordinal}>
                            {row.transactedAt.slice(0, 10)} · {row.description} ·{' '}
                            {new Intl.NumberFormat(undefined, {
                              style: 'currency',
                              currency: account.currency,
                              minimumFractionDigits: account.currencyExponent,
                              maximumFractionDigits: account.currencyExponent,
                            }).format(row.amountMinor / 10 ** account.currencyExponent)}
                            {Array.isArray(duplicateResult) && duplicateResult.includes(row.ordinal)
                              ? ' · Possible duplicate'
                              : ''}
                            {!savedImportPreview.submissionPending &&
                            Array.isArray(duplicateResult) &&
                            duplicateResult.includes(row.ordinal) ? (
                              <>
                                <button
                                  aria-label={`Include saved row ${row.ordinal}`}
                                  aria-pressed={duplicateChoices.get(row.ordinal) === 'include'}
                                  onClick={() => onDuplicateChoice(row.ordinal, 'include')}
                                >
                                  Include
                                </button>
                                <button
                                  aria-label={`Exclude saved row ${row.ordinal}`}
                                  aria-pressed={duplicateChoices.get(row.ordinal) === 'exclude'}
                                  onClick={() => onDuplicateChoice(row.ordinal, 'exclude')}
                                >
                                  Exclude
                                </button>
                              </>
                            ) : null}
                            {duplicateChoices.has(row.ordinal) ? (
                              <span>
                                {' '}
                                · Choice recorded:{' '}
                                {duplicateChoices.get(row.ordinal) === 'include'
                                  ? 'Include'
                                  : 'Exclude'}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {savedImportPreview.complete ||
                      savedImportPreview.partialRecoveryAvailable ? (
                        <>
                          {savedImportPreview.partialRecoveryAvailable ? (
                            <p>
                              The file was only partly saved. This import covers the available rows.
                            </p>
                          ) : null}
                          <label>
                            <input
                              type="checkbox"
                              checked={confirmedSavedBatch === savedImportPreview.batchId}
                              onChange={(event) =>
                                setConfirmedSavedBatch(
                                  event.target.checked ? savedImportPreview.batchId : undefined,
                                )
                              }
                            />
                            {savedImportPreview.partialRecoveryAvailable
                              ? 'Confirm import of available rows to '
                              : 'Confirm destination: '}
                            {account.friendlyName}
                          </label>
                          <button
                            disabled={
                              submittingSavedImport ||
                              confirmedSavedBatch !== savedImportPreview.batchId
                            }
                            onClick={() => void onSubmitSavedImport(savedImportPreview)}
                          >
                            {savedImportPreview.submissionPending
                              ? 'Retry confirmed import'
                              : 'Import reviewed saved rows'}
                          </button>
                        </>
                      ) : (
                        <p>Saved chunks are missing from the middle of this batch.</p>
                      )}
                    </section>
                  ) : null}
                  <p>Choices stay in this unlocked visit. Saved rows are not changed.</p>
                </>
              ) : (
                <p>No saved CSV imports for this account.</p>
              )
            ) : null}
          </section>
        ) : null}
      </section>
      <section className="finance-account-destructive" aria-label="Destructive account actions">
        <h3>Destructive actions</h3>
        <button onClick={() => void onPreviewRemoval()}>Preview account removal</button>
        {removalImpact ? (
          <section aria-label="Account removal impact">
            <strong>
              {removalImpact.outcome === 'permanent-delete'
                ? 'Permanently delete'
                : removalImpact.outcome === 'tombstone'
                  ? 'Keep an audit tombstone'
                  : 'Archive account'}
            </strong>
            <p>
              {Object.values(removalImpact.dependentCounts).reduce((sum, count) => sum + count, 0)}{' '}
              visible dependent records.
            </p>
            {removalImpact.preservedRecordTypes.length ? (
              <p>Preserved: {removalImpact.preservedRecordTypes.join(', ')}</p>
            ) : null}
          </section>
        ) : null}
      </section>
      <p role="status">{message}</p>
    </article>
  );
}
