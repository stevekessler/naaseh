import { useEffect, useState } from 'react';
import type { JournalDocument } from '@naaseh/domain';
import { JournalRichTextView } from './JournalRichTextView.js';

export function SharedCrisisPlanView({
  ownerName,
  load,
  removeAccess,
  online = navigator.onLine,
}: {
  ownerName: string;
  load: () => Promise<JournalDocument>;
  removeAccess: () => Promise<void>;
  online?: boolean;
}) {
  const [planDocument, setPlanDocument] = useState<JournalDocument | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const purge = () => setPlanDocument(null);
    const refresh = () => {
      purge();
      setMessage('');
      if (!navigator.onLine) {
        setMessage('Shared Crisis Plans require an internet connection.');
        return;
      }
      void load()
        .then((value) => {
          if (active) setPlanDocument(value);
        })
        .catch(() => {
          if (active) {
            purge();
            setMessage(
              'The shared Crisis Plan is unavailable. Sign in again or ask the owner to confirm access.',
            );
          }
        });
    };
    if (online) refresh();
    addEventListener('offline', purge);
    addEventListener('pagehide', purge);
    addEventListener('focus', refresh);
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    addEventListener('pageshow', restored);
    const hidden = () => {
      if (document.visibilityState === 'hidden') purge();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      purge();
      removeEventListener('offline', purge);
      removeEventListener('pagehide', purge);
      removeEventListener('focus', refresh);
      removeEventListener('pageshow', restored);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [load, online]);
  if (!online) return <p role="status">Shared Crisis Plans require an internet connection.</p>;
  return (
    <section>
      <h2>{ownerName}&apos;s Crisis Plan</h2>
      {planDocument ? (
        <JournalRichTextView document={planDocument} />
      ) : (
        <p role="status">{message || 'Loading shared Crisis Plan…'}</p>
      )}
      <button
        type="button"
        onClick={() => {
          if (confirm('Remove your access? Copies made outside Naaseh are not removed.'))
            void removeAccess().then(() => setPlanDocument(null));
        }}
      >
        Remove my access
      </button>
    </section>
  );
}
