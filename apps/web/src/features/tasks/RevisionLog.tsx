import {
  memoDocumentSchema,
  urgencyLabels,
  urgencySchema,
  type Task,
  type TaskRevision,
} from '@naaseh/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContext, useEffect, useState } from 'react';
import { listRevisions } from '../../db/reminder-repository.js';
import { MemoDocumentView } from '../memos/MemoDocumentView.js';
import { UserDirectoryContext } from '../profile/user-directory.js';
import { formatDueValue } from './due-value.js';

const fieldLabels: Record<string, string> = {
  label: 'Task name',
  memo: 'Memo',
  memoDocument: 'Formatted memo',
  urgency: 'Priority',
  percentComplete: 'Progress',
  dueAt: 'Due date and time',
  dueDate: 'Due date',
  dueKind: 'Due date type',
  assigneeId: 'Assignee',
  categoryId: 'Category',
  projectId: 'Project',
  groupId: 'Group',
  parentId: 'Parent task',
};

function displayValue(field: string, value: TaskRevision['after'][string] | undefined) {
  if (value === undefined) return 'Unavailable';
  if (value === null || value === '') return '—';
  if (field === 'urgency') {
    const parsed = urgencySchema.safeParse(value);
    if (parsed.success) return urgencyLabels[parsed.data];
  }
  if (field === 'percentComplete') return `${value}%`;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (field === 'dueAt') return formatDueValue(value);
    if (field === 'dueDate') return formatDueValue(undefined, value);
    if (field === 'memoDocument') {
      try {
        const document = memoDocumentSchema.safeParse(JSON.parse(value));
        if (document.success) return <MemoDocumentView document={document.data} />;
      } catch {
        return 'Unavailable';
      }
    }
  }
  return value;
}

function visibleFields(revision: TaskRevision, memoHidden: boolean) {
  return revision.changedFields.filter((field) => {
    if (field === 'encryptedMemo' || (memoHidden && ['memo', 'memoDocument'].includes(field)))
      return false;
    if (
      field === 'memo' &&
      revision.changedFields.includes('memoDocument') &&
      revision.after.memoDocument
    )
      return false;
    const before = revision.before?.[field];
    const after = revision.after[field];
    return field !== 'version' && (before === undefined || before !== after);
  });
}

async function fetchRevisions(taskId: string, signal: AbortSignal) {
  const items: TaskRevision[] = [];
  let cursor: string | null | undefined;
  do {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/revisions${suffix}`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('Could not load task history.');
    const page = (await response.json()) as { items: TaskRevision[]; cursor?: string | null };
    if (!Array.isArray(page.items) || (cursor && cursor === page.cursor))
      throw new Error('Unexpected task history response.');
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

export function RevisionLog({ task }: { task: Task }) {
  const [remote, setRemote] = useState<TaskRevision[]>();
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const local = useLiveQuery(() => listRevisions(task.id), [task.id]);

  useEffect(() => {
    let request: AbortController | undefined;
    const refresh = () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      setUnavailable(false);
      void fetchRevisions(task.id, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setRemote(items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setUnavailable(true);
        });
    };
    refresh();
    window.addEventListener('online', refresh);
    return () => {
      request?.abort();
      window.removeEventListener('online', refresh);
    };
  }, [task.id, task.version, attempt]);

  const revisions = new Map(
    (local ?? []).map((revision) => [revision.mutationId ?? revision.id, revision]),
  );
  for (const revision of remote ?? []) {
    const key = revision.mutationId ?? revision.id;
    const cached = revisions.get(key);
    revisions.set(key, {
      ...revision,
      ...(cached?.before || revision.before
        ? { before: { ...cached?.before, ...revision.before } }
        : {}),
      after: { ...cached?.after, ...revision.after },
      changedFields: [...new Set([...revision.changedFields, ...(cached?.changedFields ?? [])])],
    });
  }
  return (
    <section className="task-revision-history" aria-label="Revision history">
      <h3>Revision history</h3>
      {unavailable ? (
        <p role="status">
          Saved history is unavailable.{' '}
          <button className="quiet" type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : !remote || !local ? (
        <p role="status">Loading revision history…</p>
      ) : null}
      <RevisionTable
        revisions={[...revisions.values()]}
        memoHidden={task.memoHidden}
        loading={!remote || !local}
      />
    </section>
  );
}

export function RevisionTable({
  revisions,
  memoHidden = false,
  loading = false,
}: {
  revisions: TaskRevision[];
  memoHidden?: boolean;
  loading?: boolean;
}) {
  const users = useContext(UserDirectoryContext);
  const rows = [...revisions]
    .sort(
      (left, right) =>
        right.changedAt.localeCompare(left.changedAt) || right.version - left.version,
    )
    .flatMap((revision) =>
      visibleFields(revision, memoHidden).map((field) => ({ revision, field })),
    );

  if (!rows.length) return loading ? null : <p>No recorded changes.</p>;
  return (
    <div className="table-scroll" tabIndex={0} aria-label="Task revisions">
      <table aria-label="Task revisions">
        <thead>
          <tr>
            <th scope="col">Changed field</th>
            <th scope="col">Previous value</th>
            <th scope="col">New value</th>
            <th scope="col">When</th>
            <th scope="col">Changed by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ revision, field }) => (
            <tr key={`${revision.id}:${field}`}>
              <th scope="row">{fieldLabels[field] ?? field.replace(/[A-Z]/gu, ' $&')}</th>
              <td>
                {revision.operation === 'create'
                  ? '—'
                  : displayValue(field, revision.before?.[field])}
              </td>
              <td>{displayValue(field, revision.after[field])}</td>
              <td>
                <time dateTime={revision.changedAt}>
                  {new Date(revision.changedAt).toLocaleString()}
                </time>
                {revision.syncOutcome === 'local-pending' && <small>Pending sync</small>}
              </td>
              <td>
                {users.find((user) => user.id === revision.actorId)?.displayName ??
                  revision.actorId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
