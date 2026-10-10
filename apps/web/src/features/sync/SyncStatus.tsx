import { useEffect, useRef } from 'react';
import type { PendingSyncItem, SyncHistoryEntry } from './sync-activity.js';

const syncTypeLabels: Record<string, string> = {
  task: 'Task',
  category: 'Category',
  group: 'Group',
  list: 'List',
  listItem: 'List item',
  directoryItem: 'Directory item',
  attachment: 'Attachment',
  copyJob: 'Copy job',
  accessControl: 'Access change',
  project: 'Project',
  completionEvent: 'Completion',
  deletionJob: 'Deletion',
  taskTimer: 'Timer',
  personalStackOperation: 'Stack order',
  journalEntry: 'Journal entry',
  journalProfile: 'Journal profile',
  journalMutation: 'Journal change',
  crisisPlan: 'Crisis plan',
  crisisPlanMutation: 'Crisis plan change',
};

const formatSyncTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export function SyncStatus({
  online,
  pending,
  pendingItems = [],
  history = [],
  conflicts = 0,
  error,
  retry,
  reviewConflicts,
}: {
  online: boolean;
  pending: number;
  pendingItems?: readonly PendingSyncItem[];
  history?: readonly SyncHistoryEntry[];
  conflicts?: number;
  error?: string | undefined;
  retry: () => void;
  reviewConflicts?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeWhenClickingAway = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };

    document.addEventListener('pointerdown', closeWhenClickingAway);
    return () => document.removeEventListener('pointerdown', closeWhenClickingAway);
  }, []);

  const summary = !online
    ? `Offline${pending ? ` · ${pending} pending` : ''}`
    : error
      ? 'Sync failed'
      : conflicts
        ? `${conflicts} conflict${conflicts === 1 ? '' : 's'}`
        : pending
          ? `${pending} pending · syncing`
          : 'Synced';
  return (
    <div className="sync-status" role="status">
      {conflicts > 0 && reviewConflicts ? (
        <button
          className="sync-status-summary"
          aria-label={`Review conflicts (${conflicts})`}
          onClick={reviewConflicts}
        >
          {conflicts} conflict{conflicts === 1 ? '' : 's'} — review and resolve
        </button>
      ) : pendingItems.length || history.length ? (
        <details ref={detailsRef} className="sync-status-details">
          <summary className="sync-status-summary">{summary}</summary>
          <div className="sync-status-panel">
            <h2>Synchronization</h2>
            {pendingItems.length ? (
              <section>
                <h3>Scheduled to sync</h3>
                <ol className="sync-activity-list">
                  {pendingItems.map((item) => (
                    <li key={item.key}>
                      <strong>
                        {item.title ?? syncTypeLabels[item.entityType] ?? 'Saved change'}
                      </strong>
                      <span>
                        {item.title
                          ? `${syncTypeLabels[item.entityType] ?? 'Saved change'} · `
                          : ''}
                        {item.area} · queued {formatSyncTime(item.queuedAt)}
                        {item.attempts ? ` · ${item.attempts} retries` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="sync-safety-note">
                  These changes remain stored on this device until the server accepts them or you
                  resolve a conflict.
                </p>
              </section>
            ) : (
              <p>No changes are waiting to sync.</p>
            )}
            <section>
              <h3>Last 7 days</h3>
              {history.length ? (
                <ol className="sync-activity-list">
                  {history.map((entry) => (
                    <li key={entry.eventId}>
                      <strong>
                        {entry.title ?? syncTypeLabels[entry.entityType] ?? 'Saved change'} ·{' '}
                        {entry.status}
                      </strong>
                      <span>
                        {entry.title
                          ? `${syncTypeLabels[entry.entityType] ?? 'Saved change'} · `
                          : ''}
                        {entry.area} · {formatSyncTime(entry.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No sync activity recorded on this device yet.</p>
              )}
            </section>
            <p className="sync-history-note">
              Public task titles are included. Private task titles are never recorded. History is
              kept only in this browser for 7 days; clearing site data removes it.
            </p>
          </div>
        </details>
      ) : (
        <span className="sync-status-summary">{summary}</span>
      )}
      {online && pending > 0 && !error ? (
        <small className="sync-status-guidance">
          Usually completes within a few seconds; automatic retries wait at most 30 seconds.
        </small>
      ) : null}
      {error && (
        <div className="sync-status-error" role="alert">
          <span>{error}</span>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </div>
  );
}
