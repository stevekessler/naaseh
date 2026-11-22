import { useState } from 'react';
import type { DraftReview } from './store.js';

const actionLabels = {
  create: 'New record',
  update: 'Edit record',
  delete: 'Delete record',
};

function ReviewFields({ fields }: { fields?: Readonly<Record<string, unknown>> }) {
  if (!fields) return <p>None</p>;
  return (
    <dl>
      {Object.entries(fields).map(([field, value]) => (
        <div key={field}>
          <dt>
            {field.replace(/([A-Z])/gu, ' $1').replace(/^./u, (letter) => letter.toUpperCase())}
          </dt>
          <dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReviewChanges({
  reviews,
  resolve,
}: {
  reviews: DraftReview[];
  resolve: (review: DraftReview, retry: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!reviews.length) return null;

  async function submit(review: DraftReview, retry: boolean) {
    setBusy(true);
    setError('');
    try {
      await resolve(review, retry);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not resolve this change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>Review offline changes</summary>
      {error && <p role="alert">{error}</p>}
      <ul>
        {reviews.map((review) => {
          const { draft, current, row } = review;
          const retry = draft && (draft.action === 'create' ? !current : current);
          return (
            <li key={row.order}>
              <h3>
                {draft
                  ? `${actionLabels[draft.action]} · ${draft.kind === 'contact' ? 'Contact' : 'Inventory item'}`
                  : 'Record deleted from the workspace'}
              </h3>
              {draft && (
                <>
                  {row.status === 'reset_required' && <p>The workspace was restored.</p>}
                  <h4>Saved record</h4>
                  <ReviewFields {...(current ? { fields: current.fields } : {})} />
                  <h4>Your offline change</h4>
                  {draft.action === 'delete' ? (
                    <p>Delete the saved record.</p>
                  ) : (
                    <ReviewFields {...(draft.fields ? { fields: draft.fields } : {})} />
                  )}
                </>
              )}
              <button type="button" disabled={busy} onClick={() => void submit(review, false)}>
                {draft ? 'Discard draft' : 'Dismiss notice'}
              </button>
              {retry && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Apply your offline change to the saved workspace?'))
                      void submit(review, true);
                  }}
                >
                  Apply offline change
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
