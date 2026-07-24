import { useEffect, useState } from 'react';
import type { Attachment } from '@naaseh/domain';
import {
  downloadAttachment,
  refreshAttachment,
  removeAttachment,
  retryAttachment,
  uploadAttachment,
} from './attachment-client.js';

export function AttachmentPanel({
  parentType,
  parentId,
  items,
  csrfToken,
  changed,
}: {
  parentType: 'task' | 'listItem';
  parentId: string;
  items: Attachment[];
  csrfToken: string;
  changed: () => void;
}) {
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const [online, setOnline] = useState(() => navigator.onLine);
  const active = items.filter((item) => item.status !== 'deleted');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!online || !active.some((item) => item.status === 'scanning')) return;
    const timer = window.setInterval(() => {
      void Promise.all(
        active
          .filter((item) => item.status === 'scanning')
          .map((item) => refreshAttachment(item.id)),
      )
        .then(changed)
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [active.map((item) => `${item.id}:${item.status}`).join(','), changed, online]);
  const run = (work: Promise<unknown>) => {
    setError(undefined);
    void work
      .then(changed)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'The attachment action failed.'),
      );
  };
  return (
    <section className="attachments">
      <h3>Attachments</h3>
      <label>
        Attach a file (PDF, image, text, or CSV; up to 25 MiB)
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,text/plain,text/csv"
          disabled={!online || active.length >= 10}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setError(undefined);
            setProgress(0);
            void uploadAttachment(file, parentType, parentId, csrfToken, setProgress)
              .then(changed)
              .catch((reason) =>
                setError(reason instanceof Error ? reason.message : 'Upload failed.'),
              )
              .finally(() => setProgress(undefined));
          }}
        />
      </label>
      {!online && <p>Connect to the internet to attach or download files.</p>}
      {progress !== undefined && (
        <progress max={100} value={progress}>
          Uploading {progress}%
        </progress>
      )}
      {error && <p role="alert">{error}</p>}
      <ul>
        {active.map((item) => (
          <li key={item.id}>
            <span>
              {item.originalFilename} — {item.status.replace('_', ' ')}
            </span>
            {item.status === 'available' && (
              <button type="button" onClick={() => run(downloadAttachment(item.id))}>
                Download
              </button>
            )}
            {item.status === 'scan_failed' && (
              <button
                type="button"
                disabled={!online}
                onClick={() => run(retryAttachment(item.id, csrfToken))}
              >
                Retry scan
              </button>
            )}
            <button
              type="button"
              className="quiet"
              disabled={!online || item.status === 'scanning'}
              onClick={() => run(removeAttachment(item.id, csrfToken))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
