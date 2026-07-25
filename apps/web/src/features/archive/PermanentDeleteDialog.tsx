import { useEffect, useRef, useState } from 'react';
import type { DeletionPreview } from '@naaseh/domain';
import { purgeConfirmedDeletion } from '../../db/deletion-purge.js';
import {
  fetchDeletionPreview,
  startPermanentDeletion,
  waitForDeletion,
  type DeletionTarget,
} from './deletion-client.js';

export function PermanentDeleteDialog({
  target,
  label,
  csrfToken,
  disabled = false,
  onDeleted = () => {},
}: {
  target: DeletionTarget;
  label: string;
  csrfToken: string;
  disabled?: boolean;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'deleting' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open, preview]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const begin = async () => {
    setOpen(true);
    setStatus('loading');
    setError('');
    try {
      setPreview(await fetchDeletionPreview(target));
      setStatus('idle');
    } catch (cause) {
      setStatus('failed');
      setError(cause instanceof Error ? cause.message : 'Deletion preview failed.');
    }
  };
  return (
    <>
      <button
        type="button"
        className="danger"
        disabled={disabled || !online}
        title={!online ? 'Permanent deletion requires an internet connection.' : undefined}
        onClick={() => void begin()}
      >
        Delete permanently
      </button>
      {open && (
        <div className="modal-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby={`delete-${target.resourceId}`}>
            <h2 id={`delete-${target.resourceId}`}>Permanently delete {label}?</h2>
            <p>This cannot be undone. There is no recycle bin, and the item cannot be restored.</p>
            {preview && (
              <>
                <p>
                  This will also remove{' '}
                  {Object.values(preview.dependentCounts).reduce((sum, value) => sum + value, 0)}{' '}
                  dependent records.
                </p>
                {preview.blockers.length > 0 && (
                  <div role="alert">
                    <strong>This cannot be deleted yet:</strong>
                    <ul>
                      {preview.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {status === 'loading' && <p role="status">Reviewing dependencies…</p>}
            {status === 'deleting' && <p role="status">Permanently deleting…</p>}
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
              <button ref={cancel} type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={!preview || preview.blockers.length > 0 || status === 'deleting'}
                onClick={() =>
                  void (async () => {
                    if (!preview) return;
                    setStatus('deleting');
                    try {
                      const job = await startPermanentDeletion(
                        target,
                        preview.confirmationToken,
                        csrfToken,
                      );
                      await waitForDeletion(job);
                      await purgeConfirmedDeletion(target.resourceType, target.resourceId);
                      setOpen(false);
                      onDeleted();
                    } catch (cause) {
                      setStatus('failed');
                      setError(cause instanceof Error ? cause.message : 'Deletion failed.');
                    }
                  })()
                }
              >
                Permanently delete
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
