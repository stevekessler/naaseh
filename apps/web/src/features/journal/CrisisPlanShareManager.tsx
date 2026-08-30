import { useEffect, useRef, useState } from 'react';
import $ from 'jquery';
import select2Factory from 'select2';
import 'select2/dist/css/select2.css';
import type { CrisisPlanShare } from '@naaseh/domain';
import type { CrisisPlanActiveUser } from './crisis-plan-client.js';

export const crisisPlanSelect2Options = Object.freeze({ minimumInputLength: 2, width: '100%' });
const installSelect2 = select2Factory as unknown as (root: Window, jquery: JQueryStatic) => void;
if (typeof window !== 'undefined' && !$.fn.select2) installSelect2(window, $);
export function CrisisPlanShareManager({
  online = navigator.onLine,
  shares,
  pendingRecipientIds = [],
  rotationRequired = false,
  search,
  onShare,
  onRevoke,
  onRotate,
}: {
  online?: boolean;
  shares: CrisisPlanShare[];
  pendingRecipientIds?: string[];
  rotationRequired?: boolean;
  search: (query: string) => Promise<CrisisPlanActiveUser[]>;
  onShare: (user: CrisisPlanActiveUser) => Promise<void>;
  onRevoke: (recipientId: string) => Promise<void>;
  onRotate?: () => Promise<void>;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const users = useRef(new Map<string, CrisisPlanActiveUser>());
  const [status, setStatus] = useState('');
  useEffect(() => {
    const element = selectRef.current;
    if (!element) return;
    const node = $(element);
    node.select2({
      ...crisisPlanSelect2Options,
      placeholder: !online
        ? 'Connect to search users'
        : rotationRequired
          ? 'Rotate sharing keys first'
          : 'Search active users',
      disabled: !online || rotationRequired,
      ajax: {
        delay: 250,
        transport: (params, success, failure) => {
          const query = String((params.data as { term?: string } | undefined)?.term ?? '');
          void search(query)
            .then((results) => {
              for (const user of results) users.current.set(user.id, user);
              success({
                results: results.map((user) => ({
                  id: user.id,
                  text: `${user.displayName} (${user.username})`,
                })),
              });
            })
            .catch(failure);
          return { abort: () => undefined };
        },
        processResults: (value) => value,
      },
    });
    const selected = () => {
      const id = String(node.val() ?? '');
      const user = users.current.get(id);
      if (!user) return;
      setStatus('Adding encrypted read-only access…');
      void onShare(user)
        .then(() => {
          setStatus(`${user.displayName} can now view this Crisis Plan while online.`);
          node.val('').trigger('change');
        })
        .catch((error) =>
          setStatus(error instanceof Error ? error.message : 'Access could not be added.'),
        );
    };
    node.on('select2:select', selected);
    return () => {
      node.off('select2:select', selected);
      if (node.hasClass('select2-hidden-accessible')) node.select2('destroy');
    };
  }, [online, onShare, rotationRequired, search]);
  return (
    <section>
      <h3>Share this Crisis Plan</h3>
      <p>
        Selected users receive read-only access while online. They may still make copies outside
        this application.
      </p>
      {rotationRequired && (
        <div role="alert">
          <p>A recipient removed access. Rotate the sharing key before editing or sharing again.</p>
          <button
            type="button"
            disabled={!online}
            onClick={() => {
              setStatus('Rotating encrypted access…');
              void onRotate?.()
                .then(() => setStatus('Encrypted sharing access is current.'))
                .catch((error) =>
                  setStatus(
                    error instanceof Error
                      ? error.message
                      : 'Access rotation could not be completed.',
                  ),
                );
            }}
          >
            Rotate sharing keys now
          </button>
        </div>
      )}
      <label htmlFor="crisis-plan-user">Select a user</label>
      <select id="crisis-plan-user" ref={selectRef} aria-describedby="crisis-plan-share-status">
        <option />
      </select>
      <p id="crisis-plan-share-status" aria-live="polite">
        {status ||
          (!online
            ? 'Sharing changes stay pending until you reconnect; existing remote access may continue.'
            : '')}
      </p>
      <ul>
        {shares
          .filter((share) => share.state === 'active')
          .map((share) => (
            <li key={share.recipientId}>
              <span>Active recipient</span>{' '}
              {pendingRecipientIds.includes(share.recipientId) ? (
                <span role="status">
                  Revocation pending connection; remote access may continue.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        'Revoke application access? Copies made outside Naaseh cannot be retracted.',
                      )
                    )
                      void onRevoke(share.recipientId);
                  }}
                >
                  Revoke access
                </button>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
