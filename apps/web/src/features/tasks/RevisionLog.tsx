import type { TaskRevision } from '@naaseh/domain';
export function RevisionLog({ revisions }: { revisions: TaskRevision[] }) {
  return (
    <ol>
      {revisions.map((item) => (
        <li key={item.id}>
          {item.operation} by {item.actorId} at{' '}
          <time>{new Date(item.changedAt).toLocaleString()}</time> — {item.changedFields.join(', ')}
          . Sync: {item.syncOutcome}
          {item.sourceClientId ? `; client ${item.sourceClientId}` : ''}
          {item.before ? (
            <details>
              <summary>Safe changes</summary>
              <pre>{JSON.stringify({ before: item.before, after: item.after }, null, 2)}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
