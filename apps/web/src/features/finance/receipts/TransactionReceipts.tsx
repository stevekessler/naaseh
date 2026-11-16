import { useEffect, useRef, useState } from 'react';
import { financeReceiptMediaTypes } from '@naaseh/domain';
import { queueReceiptFile, receiptDraftIds } from '../../../db/finance-receipt-repository.js';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  cancelReceipt,
  uploadSavedReceipt,
  requestReceiptPage,
  type ReceiptView,
} from './receipt-client.js';
import { ReceiptContent } from './ReceiptContent.js';

const accept = Object.keys(financeReceiptMediaTypes)
  .map((extension) => '.' + extension)
  .join(',');
const statusLabels = {
  available: 'Available',
  pending_upload: 'Upload pending',
  scanning: 'Checking receipt',
  scan_failed: 'Check failed',
  rejected: 'Rejected',
  expired: 'Upload expired',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
} as const;

export function TransactionReceipts({
  transactionId,
  csrfToken,
  editable,
}: {
  transactionId: string;
  csrfToken: string;
  editable: boolean;
}) {
  const [items, setItems] = useState<ReceiptView[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [next, setNext] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paging, setPaging] = useState(false);
  const listing = useRef<AbortSignal | undefined>(undefined);
  const base = '/finance/transactions/' + encodeURIComponent(transactionId) + '/receipts';

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listing.current = signal;
    setItems([]);
    setNext(undefined);
    setDrafts([]);
    setPaging(false);
    const clear = () => {
      controller.abort();
      setItems([]);
      setDrafts([]);
      setNext(undefined);
      setPaging(false);
      setMessage('');
    };
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    void receiptDraftIds(transactionId)
      .then((ids) => {
        if (!signal.aborted) setDrafts(ids);
      })
      .catch(() => {});
    if (navigator.onLine) {
      void requestReceiptPage(base, { signal })
        .then((result) => {
          if (signal.aborted) return;
          setItems(result.items);
          setNext(result.nextCursor);
        })
        .catch(() => {
          if (!signal.aborted) setMessage('Receipts could not be loaded. Refresh to try again.');
        });
    }
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [base, refresh, transactionId]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      setRefresh((value) => value + 1);
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The receipt action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore(cursor: string) {
    const signal = listing.current;
    if (!signal || signal.aborted || paging) return;
    setPaging(true);
    try {
      const result = await requestReceiptPage(base + '?' + new URLSearchParams({ cursor }), {
        signal,
      });
      if (signal.aborted) return;
      setItems((current) => [
        ...new Map([...current, ...result.items].map((receipt) => [receipt.id, receipt])).values(),
      ]);
      setNext(result.nextCursor);
    } catch {
      if (signal.aborted) return;
      setItems([]);
      setNext(undefined);
      setMessage('Receipts could not be rechecked. Refresh to try again.');
    } finally {
      if (!signal.aborted) setPaging(false);
    }
  }

  async function uploadDraft(id: string) {
    setUploading(true);
    try {
      const receipt = await uploadSavedReceipt(id, csrfToken);
      if (!receipt || ['pending_upload', 'expired', 'cancelled'].includes(receipt.status))
        throw new Error('Upload is incomplete. Refresh receipts or retry the saved file.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-label="Transaction receipts">
      <h3>Receipts</h3>
      {editable ? (
        <label>
          Attach receipt
          <input
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file)
                void run(
                  async () => {
                    const id = await queueReceiptFile(transactionId, file);
                    setRefresh((value) => value + 1);
                    if (navigator.onLine) await uploadDraft(id);
                  },
                  navigator.onLine
                    ? 'Receipt uploaded for checking.'
                    : 'Encrypted receipt saved for upload on reconnect.',
                );
            }}
          />
        </label>
      ) : null}
      <button type="button" onClick={() => setRefresh((value) => value + 1)}>
        Refresh receipts
      </button>
      {uploading ? <p role="status">Uploading receipt…</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {drafts.map((id) => (
        <div key={id}>
          <p>Encrypted receipt pending upload</p>
          {navigator.onLine ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => uploadDraft(id), 'Receipt uploaded for checking.')}
              >
                Retry upload
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => cancelReceipt(id, csrfToken), 'Receipt cancelled.')}
              >
                Cancel upload
              </button>
            </>
          ) : null}
        </div>
      ))}
      <ul>
        {items
          .filter((receipt) => !['cancelled', 'deleted'].includes(receipt.status))
          .map((receipt) => (
            <li key={receipt.id}>
              <strong>{receipt.originalFilename}</strong>
              <p>
                {receipt.mediaType} · {receipt.sizeBytes.toLocaleString()} bytes
              </p>
              <p>
                {statusLabels[receipt.status]}
                {receipt.failureCode === 'policy'
                  ? '. Choose a supported receipt without active or encrypted content.'
                  : ''}
              </p>
              {receipt.status === 'scan_failed' && editable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        financeRequest(`/finance/receipts/${receipt.id}/retry`, {
                          method: 'POST',
                          csrfToken,
                          body: JSON.stringify({ expectedVersion: receipt.version }),
                        }),
                      'Receipt check restarted.',
                    )
                  }
                >
                  Retry check
                </button>
              ) : null}
              <ReceiptContent receipt={receipt} />
            </li>
          ))}
      </ul>
      {next ? (
        <button type="button" disabled={busy || paging} onClick={() => void loadMore(next)}>
          {paging ? 'Loading receipts…' : 'Load more receipts'}
        </button>
      ) : null}
    </section>
  );
}
