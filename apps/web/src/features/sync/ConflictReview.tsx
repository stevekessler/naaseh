import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Task } from '@naaseh/domain';
import {
  listReviewConflicts,
  readConflictTask,
  resolveReviewedConflict,
  type ReviewConflict,
} from '../../sync/conflict-review.js';

const fieldLabels: Record<string, string> = {
  label: 'Task label',
  memo: 'Memo',
  link: 'Link',
  dueAt: 'Due',
  dueKind: 'Due type',
  dueDate: 'Due date',
  dueTimeZone: 'Time zone',
  assigneeId: 'Assignee',
  categoryId: 'Category',
  projectId: 'Project',
  groupId: 'Group',
  parentId: 'Parent task',
  visibility: 'Visibility',
  urgency: 'Urgency',
  postItColor: 'Note color',
  status: 'Status',
  memoHidden: 'Memo protection',
};
const displayValue = (value: unknown) =>
  value === undefined || value === null
    ? 'Not set'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

function ConflictItem({
  conflict,
  synchronize,
}: {
  conflict: ReviewConflict;
  synchronize: () => Promise<void>;
}) {
  const [remote, setRemote] = useState<Task | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isTask = conflict.mutation?.entityType === 'task';
  const payload = conflict.mutation?.payload as Record<string, unknown> | undefined;
  const savedFields =
    payload && typeof payload.patch === 'object' && payload.patch
      ? (payload.patch as Record<string, unknown>)
      : payload;
  const protectedFields = new Set(['memoDocument', 'encryptedMemo']);
  const fields = Object.fromEntries(
    Object.entries(savedFields ?? {}).filter(
      ([field]) => !protectedFields.has(field) && (!isTask || field in fieldLabels),
    ),
  );
  const title =
    typeof fields?.label === 'string'
      ? fields.label
      : (remote?.label ?? `${conflict.mutation?.entityType ?? 'Saved change'} conflict`);
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      setRemote(await readConflictTask(conflict));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load the server version.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!isTask) return;
    let active = true;
    void readConflictTask(conflict)
      .then((task) => {
        if (active) setRemote(task);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [conflict, isTask]);
  const resolve = async (choice: 'local' | 'remote') => {
    setBusy(true);
    setError('');
    try {
      await resolveReviewedConflict(conflict, choice, remote);
      await synchronize();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not resolve this conflict.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="sync-conflict-item">
      <h3>{title}</h3>
      {conflict.createdAt && (
        <p>Saved on this device: {new Date(conflict.createdAt).toLocaleString()}</p>
      )}
      {isTask && (
        <>
          <p>
            Compare your saved change with the current server version. Keeping your version sends
            the saved change again; if the task changes meanwhile, it will need another review.
          </p>
          {conflict.mutation?.operation === 'create' && (
            <p>
              A task with this ID already exists. Keep the server version, then edit the task to
              apply any saved details you want to retain.
            </p>
          )}
          <div className="sync-conflict-comparison">
            <section>
              <h4>Your saved change</h4>
              <dl>
                {Object.entries(fields ?? {}).map(([field, value]) => (
                  <div key={field}>
                    <dt>{fieldLabels[field] ?? field}</dt>
                    <dd>{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <h4>Current server version</h4>
              {remote === undefined ? (
                <p>Server version has not loaded.</p>
              ) : remote === null ? (
                <p>
                  This task was deleted or you no longer have access. You can discard the saved
                  change.
                </p>
              ) : (
                <dl>
                  {Object.keys(fields ?? {}).map((field) => (
                    <div key={field}>
                      <dt>{fieldLabels[field] ?? field}</dt>
                      <dd>{displayValue((remote as unknown as Record<string, unknown>)[field])}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>
        </>
      )}
      {!isTask && (
        <p>
          {conflict.message ??
            (conflict.reason === 'timer_changed'
              ? 'A timer change could not sync. Discard this failed change to keep the synchronized timer state.'
              : conflict.reason === 'project_unavailable'
                ? 'This project points to a category that is not on the server. Resolve the category conflict, then recreate the project under a synchronized category. Discarding removes only this unsynced project from this device.'
                : conflict.mutation
                  ? conflict.mutation.operation === 'create'
                    ? 'This saved operation could not sync. Discarding a new, unsynced category or project removes that local record once it has no dependent work.'
                    : 'This saved operation could not sync. Discard the failed edit to keep the synchronized server version.'
                  : 'This saved change is unavailable or access has changed. Its protected content cannot be displayed. You can discard this notice.')}
        </p>
      )}
      {!isTask &&
        Object.keys(fields).length > 0 &&
        !['authorization_changed', 'hard_deleted'].includes(conflict.reason) && (
          <details>
            <summary>Saved change</summary>
            <pre>{JSON.stringify(fields, null, 2)}</pre>
          </details>
        )}
      {error && <p role="alert">{error}</p>}
      <div className="sync-conflict-actions">
        {!isTask &&
          ['category', 'project'].includes(conflict.mutation?.entityType ?? '') &&
          conflict.reason === 'project_unavailable' && (
            <button disabled={busy} onClick={() => void resolve('local')}>
              Retry saved change
            </button>
          )}
        {isTask && (
          <button disabled={busy} onClick={() => void refresh()}>
            Refresh comparison
          </button>
        )}
        {isTask &&
          conflict.mutation?.operation !== 'create' &&
          !['authorization_changed', 'hard_deleted'].includes(conflict.reason) && (
            <button disabled={busy || !remote} onClick={() => void resolve('local')}>
              Keep My Version
            </button>
          )}
        <button
          disabled={busy || (isTask && remote === undefined)}
          onClick={() => void resolve('remote')}
        >
          {isTask && remote ? 'Keep Server Version' : 'Discard saved change'}
        </button>
      </div>
    </article>
  );
}

export function ConflictReview({
  close,
  synchronize,
}: {
  close: () => void;
  synchronize: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const conflicts = useLiveQuery(listReviewConflicts, []);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="task-edit-dialog sync-conflict-dialog"
      aria-labelledby="sync-conflicts-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="sync-conflicts-title">Resolve sync conflicts</h2>
        <button onClick={close}>Close</button>
      </header>
      <p>
        A conflict is a saved change that could not sync, usually because the server version changed
        on another device or in another tab. Your saved change is kept here until you choose what to
        do.
      </p>
      {!conflicts ? (
        <p>Loading conflicts…</p>
      ) : conflicts.length === 0 ? (
        <p role="status">All conflicts resolved. Reapplied changes may still be waiting to sync.</p>
      ) : (
        conflicts.map((conflict) => (
          <ConflictItem key={conflict.id} conflict={conflict} synchronize={synchronize} />
        ))
      )}
    </dialog>
  );
}
