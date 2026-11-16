import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { peekFinanceAccess } from '../security/finance-access.js';
import { downloadReceipt, type ReceiptView } from './receipt-client.js';

const PdfReceiptPreview = lazy(() => import('./PdfReceiptPreview.js'));

export function ReceiptContent({ receipt }: { receipt: ReceiptView }) {
  if (receipt.status !== 'available' || !receipt.etag) return null;
  return (
    <AvailableReceiptContent
      key={JSON.stringify([receipt.id, receipt.version, receipt.etag])}
      receipt={receipt}
    />
  );
}

function AvailableReceiptContent({ receipt }: { receipt: ReceiptView }) {
  const url = useRef<string | undefined>(undefined);
  const request = useRef<AbortController | undefined>(undefined);
  const [preview, setPreview] = useState<{ url: string; blob: Blob }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const clear = () => {
      request.current?.abort();
      request.current = undefined;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = undefined;
    };
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      clear();
      setPreview(undefined);
      setBusy(false);
      setError('');
    });
    return () => {
      unsubscribe?.();
      clear();
    };
  }, []);
  const canPreview =
    receipt.mediaType === 'application/pdf' || receipt.mediaType.startsWith('image/');
  const close = () => {
    request.current?.abort();
    request.current = undefined;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = undefined;
    setPreview(undefined);
    setBusy(false);
  };
  const open = async () => {
    close();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const blob = await downloadReceipt(receipt, controller.signal);
      if (controller.signal.aborted) return;
      url.current = URL.createObjectURL(blob);
      setPreview({ url: url.current, blob });
    } catch {
      if (!controller.signal.aborted)
        setError('The receipt could not be verified. Refresh and try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div>
      <button type="button" onClick={() => void open()} disabled={busy}>
        {busy ? 'Verifying receipt…' : canPreview ? 'View / download' : 'Prepare original download'}
      </button>
      {!canPreview ? <p>Office files are available as original downloads.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <>
          {receipt.mediaType.startsWith('image/') ? (
            <img
              src={preview.url}
              alt={receipt.originalFilename}
              className="finance-receipt-preview"
            />
          ) : null}
          {receipt.mediaType === 'application/pdf' ? (
            <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
              <PdfReceiptPreview blob={preview.blob} filename={receipt.originalFilename} />
            </Suspense>
          ) : null}
          <a href={preview.url} download={receipt.originalFilename}>
            Save original file
          </a>
          <button type="button" onClick={close}>
            Close receipt
          </button>
        </>
      ) : null}
    </div>
  );
}
