import { useState } from 'react';
import { createUlid } from '@naaseh/domain';
export function CopyListAction({
  listId,
  csrfToken,
  ready,
}: {
  listId: string;
  csrfToken: string;
  ready: (id: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'copying' | 'failed' | 'ready'>('idle');
  return (
    <div>
      <button
        disabled={state === 'copying'}
        onClick={() => {
          setState('copying');
          void fetch(`/api/v1/lists/${listId}/copies`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'x-csrf-token': csrfToken, 'x-client-mutation-id': createUlid() },
          })
            .then(async (response) => {
              if (!response.ok) throw new Error();
              return response.json() as Promise<{ destinationListId: string }>;
            })
            .then((job) => {
              setState('ready');
              ready(job.destinationListId);
            })
            .catch(() => setState('failed'));
        }}
      >
        {state === 'copying' ? 'Copying…' : 'Copy list'}
      </button>
      {state === 'copying' && <progress aria-label="Copying list" />}
      {state === 'ready' && <p role="status">The copied list is ready.</p>}
      {state === 'failed' && (
        <p role="alert">
          The list could not be copied. <button onClick={() => setState('idle')}>Try again</button>
        </p>
      )}
    </div>
  );
}
