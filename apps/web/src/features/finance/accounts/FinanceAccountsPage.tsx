import {
  readSavedCsvImports,
  readSavedCsvImportPreview,
  recoverSavedCsvImport,
  type SavedCsvImportSummary,
  type SavedCsvImportPreview,
  type SavedCsvPage,
} from '../../../db/finance-repository.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FinanceClientError, financeRequest } from '../finance-client.js';
import {
  FinanceAccountDetail,
  type AccountRemovalImpact,
  type FinanceAccountView,
} from './FinanceAccountDetail.js';
import { prepareSavedCsvSubmission, SavedCsvReviewError } from '../csv/saved-csv-recovery.js';
import type { DuplicateDecision } from '../csv/csv-import.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  disposeFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

type Account = FinanceAccountView;

const savedRowKey = (batchId: string, row: SavedCsvImportPreview['rows'][number]) =>
  JSON.stringify([batchId, row.ordinal, row.transactedAt, row.amountMinor, row.description]);

const money = (account: Account) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: account.currency,
    minimumFractionDigits: account.currencyExponent,
    maximumFractionDigits: account.currencyExponent,
  }).format(account.currentBalanceMinor / 10 ** account.currencyExponent);

export function FinanceAccountsPage(props: {
  ownerId: string;
  csrfToken: string;
  initialAccountId?: string;
  onOpenAccount?: (accountId: string) => void;
}) {
  return <FinanceAccountsContent key={props.ownerId} {...props} />;
}

function FinanceAccountsContent({
  ownerId,
  csrfToken,
  initialAccountId,
  onOpenAccount,
}: {
  ownerId: string;
  csrfToken: string;
  initialAccountId?: string;
  onOpenAccount?: (accountId: string) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [removalImpact, setRemovalImpact] = useState<AccountRemovalImpact>();
  const [savedImports, setSavedImports] = useState<SavedCsvImportSummary[]>();
  const [savedImportPreview, setSavedImportPreview] = useState<SavedCsvImportPreview>();
  const [duplicateResult, setDuplicateResult] = useState<number[] | string>();
  const [duplicateChoices, setDuplicateChoices] = useState<Map<string, DuplicateDecision>>(
    () => new Map(),
  );
  const [checkedSavedRows, setCheckedSavedRows] = useState<Map<string, boolean>>(() => new Map());
  const [savedImportMessage, setSavedImportMessage] = useState('');
  const [submittingSavedImport, setSubmittingSavedImport] = useState(false);
  const savedSubmission = useRef(false);
  const savedImportRequest = useRef(0);
  const [checking, setChecking] = useState(true);
  const snapshot = useRef<FinanceApiSnapshot<Account[]> | undefined>(undefined);
  const serial = useRef(0),
    visit = useRef(0);
  const selectionRequest = useRef(0),
    previewRequest = useRef(0);
  const clearAccountPreviews = useCallback(() => {
    previewRequest.current++;
    setRemovalImpact(undefined);
    savedImportRequest.current++;
    setSavedImports(undefined);
    setSavedImportPreview(undefined);
    setDuplicateResult(undefined);
    setDuplicateChoices(new Map());
    setCheckedSavedRows(new Map());
    setSavedImportMessage('');
  }, []);
  const clearSnapshot = useCallback(() => {
    serial.current++;
    visit.current++;
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    snapshot.current = undefined;
    setAccounts([]);
    setSelectedId(undefined);
    selectionRequest.current++;
    clearAccountPreviews();
    setChecking(false);
    setError('Reconnect and refresh Finance to view accounts.');
  }, [clearAccountPreviews]);
  const refreshAccounts = useCallback(
    async (selected?: string) => {
      const current = ++serial.current;
      clearAccountPreviews();
      setChecking(true);
      setError('');
      let retained: FinanceApiSnapshot<Account[]> | undefined;
      try {
        retained = await loadFinanceApiSnapshot(
          async (request) => (await request<{ items: Account[] }>('/finance/accounts')).items,
        );
        if (current !== serial.current) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        const items = await readFinanceApiSnapshot(retained, (value) => value);
        if (current !== serial.current) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
        snapshot.current = retained;
        setAccounts(items);
        setSelectedId(selected);
        setChecking(false);
        return true;
      } catch {
        if (retained) disposeFinanceApiSnapshot(retained);
        if (current === serial.current) clearSnapshot();
        return false;
      }
    },
    [clearAccountPreviews, clearSnapshot],
  );
  useEffect(() => {
    clearSnapshot();
    const unsubscribe = peekFinanceAccess()?.onLock(clearSnapshot);
    void refreshAccounts(initialAccountId);
    return () => {
      unsubscribe?.();
      serial.current++;
      visit.current++;
      if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
      snapshot.current = undefined;
    };
  }, [ownerId, initialAccountId, clearSnapshot, refreshAccounts]);
  const openAccount = async (id: string) => {
    const retained = snapshot.current;
    const current = serial.current;
    const selection = ++selectionRequest.current;
    const currentSelection = () =>
      current === serial.current && selection === selectionRequest.current;
    if (!retained) return;
    clearAccountPreviews();
    try {
      const allowed = await readFinanceApiSnapshot(retained, (items) =>
        items.some((account) => account.id === id),
      );
      if (allowed && currentSelection() && snapshot.current === retained) {
        clearAccountPreviews();
        setSelectedId(id);
        onOpenAccount?.(id);
      }
    } catch {
      if (currentSelection()) clearSnapshot();
    }
  };
  const previewRemoval = async (id: string) => {
    const retained = snapshot.current;
    if (!retained || checking) return;
    const current = serial.current;
    const requestId = ++previewRequest.current;
    setRemovalImpact(undefined);
    const currentRequest = () =>
      current === serial.current &&
      requestId === previewRequest.current &&
      snapshot.current === retained;
    let preview: FinanceApiSnapshot<AccountRemovalImpact> | undefined;
    try {
      await readFinanceApiSnapshot(retained, () => undefined);
      if (!currentRequest()) return;
      preview = await loadFinanceApiSnapshot((request) =>
        request<AccountRemovalImpact>(
          `/finance/records/account/${encodeURIComponent(id)}/deletion-preview`,
        ),
      );
      if (!currentRequest()) return;
      const impact = await readFinanceApiSnapshot(
        preview,
        ({ outcome, dependentCounts, preservedRecordTypes }) => ({
          outcome,
          dependentCounts,
          preservedRecordTypes,
        }),
      );
      if (currentRequest()) setRemovalImpact(impact);
    } catch {
      if (currentRequest()) clearSnapshot();
    } finally {
      if (preview) disposeFinanceApiSnapshot(preview);
    }
  };
  const inspectSavedImports = async (
    id: string,
    batchId?: string,
    page?: SavedCsvPage,
    checkDuplicates = false,
  ) => {
    const retained = snapshot.current;
    if (!retained || checking) return;
    const requestId = ++savedImportRequest.current;
    const selection = selectionRequest.current;
    const revision = serial.current;
    const stillCurrent = () =>
      requestId === savedImportRequest.current &&
      selection === selectionRequest.current &&
      revision === serial.current &&
      retained === snapshot.current;
    if (!batchId) setSavedImports(undefined);
    setSavedImportPreview(undefined);
    setDuplicateResult(undefined);
    try {
      const data = await readFinanceApiSnapshot(retained, async (items) => {
        const account = items.find((item) => item.id === id);
        if (!account?.scope || account.connectionId) throw new Error('Account unavailable.');
        const scopeKey =
          account.scope.type === 'owner'
            ? `OWNER#${account.scope.ownerId}`
            : `GROUP#${account.scope.groupId}`;
        if (!batchId) return { summaries: await readSavedCsvImports(id, scopeKey) };
        const preview = await readSavedCsvImportPreview(id, scopeKey, batchId, page);
        if (!preview?.rows.length || !checkDuplicates || !stillCurrent()) return { preview };
        try {
          const result = await financeRequest<{ ordinals: number[] }>(
            `/finance/accounts/${encodeURIComponent(id)}/csv-duplicates`,
            {
              method: 'POST',
              csrfToken,
              idempotencyKey: crypto.randomUUID(),
              body: JSON.stringify({ rows: preview.rows }),
            },
          );
          const inputOrdinals = new Set(preview.rows.map(({ ordinal }) => ordinal));
          if (
            !Array.isArray(result.ordinals) ||
            result.ordinals.some((ordinal) => !inputOrdinals.has(ordinal))
          )
            throw new Error('CSV duplicate response could not be verified.');
          return { preview, duplicates: result.ordinals };
        } catch (error) {
          if (error instanceof FinanceClientError && error.problem.status === 409)
            return { preview, duplicates: error.problem.message };
          throw error;
        }
      });
      if (!stillCurrent()) return;
      if (data.summaries) setSavedImports(data.summaries);
      else if (data.preview) {
        setSavedImportPreview(data.preview);
        setDuplicateResult(data.duplicates);
        if (Array.isArray(data.duplicates)) {
          const { batchId, rows } = data.preview;
          const duplicates = new Set(data.duplicates);
          setCheckedSavedRows((current) => {
            const next = new Map(current);
            for (const row of rows)
              next.set(savedRowKey(batchId, row), duplicates.has(row.ordinal));
            return next;
          });
          setDuplicateChoices((current) => {
            const next = new Map(current);
            for (const row of rows) {
              if (!duplicates.has(row.ordinal)) next.delete(savedRowKey(batchId, row));
            }
            return next;
          });
        }
      } else setSavedImports(undefined);
    } catch {
      if (stillCurrent()) clearSnapshot();
    }
  };
  const recordDuplicateChoice = (ordinal: number, decision: DuplicateDecision) => {
    if (
      !savedImportPreview ||
      !Array.isArray(duplicateResult) ||
      !duplicateResult.includes(ordinal)
    )
      return;
    const row = savedImportPreview.rows.find((item) => item.ordinal === ordinal);
    if (!row) return;
    const key = savedRowKey(savedImportPreview.batchId, row);
    setDuplicateChoices((current) => new Map(current).set(key, decision));
  };
  const visibleChoices = new Map(
    savedImportPreview?.rows.flatMap((row) => {
      const decision = duplicateChoices.get(savedRowKey(savedImportPreview.batchId, row));
      return decision ? [[row.ordinal, decision] as const] : [];
    }),
  );
  const submitSavedImport = async (id: string, preview: SavedCsvImportPreview) => {
    const { batchId, offset, limit } = preview;
    const retained = snapshot.current;
    if (!retained || checking || savedSubmission.current) return;
    savedSubmission.current = true;
    setSubmittingSavedImport(true);
    setSavedImportMessage('');
    const selection = selectionRequest.current;
    try {
      await readFinanceApiSnapshot(retained, async (items) => {
        const account = items.find((item) => item.id === id);
        if (!account?.scope || account.connectionId || selection !== selectionRequest.current)
          throw new Error('Account unavailable.');
        const scopeKey =
          account.scope.type === 'owner'
            ? `OWNER#${account.scope.ownerId}`
            : `GROUP#${account.scope.groupId}`;
        await recoverSavedCsvImport({
          accountId: id,
          scopeKey,
          batchId,
          resume: preview.submissionPending === true,
          prepare: (rows) =>
            prepareSavedCsvSubmission(batchId, id, rows, (row) => {
              const key = savedRowKey(batchId, row);
              const duplicate = checkedSavedRows.get(key);
              const decision = duplicateChoices.get(key);
              return duplicate === undefined
                ? undefined
                : { duplicate, ...(decision ? { decision } : {}) };
            }),
          dispatch: async (chunks, signal) => {
            const expected = chunks.reduce((count, chunk) => count + chunk.rows.length, 0);
            for (const chunk of chunks) {
              signal.throwIfAborted();
              if (selection !== selectionRequest.current) throw new Error('Account changed.');
              const receipt = await financeRequest<{
                id: string;
                accountId: string;
                fileDigest: string;
                duplicateDecisionDigest: string;
                status: string;
                counts: { committed: number; failed: number };
              }>(`/finance/accounts/${encodeURIComponent(id)}/csv-imports`, {
                method: 'POST',
                signal,
                csrfToken,
                idempotencyKey: `saved-csv:${chunk.batchId}:${chunk.chunkIndex}`,
                body: JSON.stringify(chunk),
              });
              if (
                receipt?.id !== chunk.batchId ||
                receipt.accountId !== id ||
                receipt.fileDigest !== chunk.fileDigest ||
                receipt.duplicateDecisionDigest !== chunk.duplicateDecisionDigest ||
                receipt.counts?.failed !== 0 ||
                (chunk.finalChunk &&
                  (receipt.status !== 'succeeded' || receipt.counts.committed !== expected))
              )
                throw new Error('The saved CSV submission is still awaiting confirmation.');
            }
            if (selection !== selectionRequest.current) throw new Error('Account changed.');
          },
        });
      });
      if (retained === snapshot.current && selection === selectionRequest.current) {
        if (await refreshAccounts(id)) setSavedImportMessage('Saved CSV rows imported.');
      }
    } catch (error) {
      if (retained === snapshot.current && selection === selectionRequest.current) {
        setSavedImportMessage(
          error instanceof SavedCsvReviewError
            ? error.message
            : 'Saved CSV submission could not be confirmed. Your saved rows are available to retry.',
        );
        if (!(error instanceof SavedCsvReviewError))
          await inspectSavedImports(id, batchId, { offset, limit });
      }
    } finally {
      savedSubmission.current = false;
      setSubmittingSavedImport(false);
    }
  };
  const selectedAccount = accounts.find(({ id }) => id === selectedId);
  const displayedVisit = visit.current;
  const displayedSelection = selectionRequest.current;
  const displayedSerial = serial.current;
  const isCurrentAccountView = () =>
    displayedVisit === visit.current &&
    displayedSelection === selectionRequest.current &&
    displayedSerial === serial.current;
  const authorizeAccountEdit = async () => {
    const retained = snapshot.current;
    if (!retained || !selectedAccount || checking || !isCurrentAccountView()) return false;
    try {
      const allowed = await readFinanceApiSnapshot(retained, (items) =>
        items.some(
          ({ id, version }) => id === selectedAccount.id && version === selectedAccount.version,
        ),
      );
      if (!isCurrentAccountView()) return false;
      if (!allowed) clearSnapshot();
      return allowed;
    } catch {
      if (isCurrentAccountView()) clearSnapshot();
      return false;
    }
  };
  return (
    <div className="finance-accounts">
      <h2>Accounts</h2>
      <button disabled={checking} onClick={() => void refreshAccounts()}>
        Refresh accounts
      </button>
      {checking ? <p role="status">Checking accounts…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div hidden={checking}>
        <div className="finance-account-grid">
          {accounts.map((account) => (
            <article key={account.id}>
              <h3>{account.friendlyName}</h3>
              <p>{money(account)}</p>
              <p>
                {account.status === 'attention'
                  ? 'Needs account details'
                  : account.freshness?.stale
                    ? 'Refresh recommended'
                    : 'Up to date'}
              </p>
              <button disabled={checking} onClick={() => void openAccount(account.id)}>
                Open account
              </button>
            </article>
          ))}
        </div>
        {selectedAccount ? (
          <FinanceAccountDetail
            key={selectedAccount.id}
            account={selectedAccount}
            csrfToken={csrfToken}
            {...(removalImpact ? { removalImpact } : {})}
            onPreviewRemoval={() => previewRemoval(selectedAccount.id)}
            {...(savedImports ? { savedImports } : {})}
            onInspectSavedImports={() => inspectSavedImports(selectedAccount.id)}
            {...(savedImportPreview ? { savedImportPreview } : {})}
            onPreviewSavedImport={(batchId, page) =>
              inspectSavedImports(selectedAccount.id, batchId, page)
            }
            {...(duplicateResult !== undefined ? { duplicateResult } : {})}
            onCheckSavedDuplicates={(batchId, page) =>
              inspectSavedImports(selectedAccount.id, batchId, page, true)
            }
            duplicateChoices={visibleChoices}
            onDuplicateChoice={recordDuplicateChoice}
            onSubmitSavedImport={(preview) => submitSavedImport(selectedAccount.id, preview)}
            submittingSavedImport={submittingSavedImport}
            savedImportMessage={savedImportMessage}
            authorizeEdit={authorizeAccountEdit}
            onChange={async () =>
              isCurrentAccountView() ? refreshAccounts(selectedAccount.id) : false
            }
          />
        ) : null}
      </div>
    </div>
  );
}
