import { urgencyLabels, urgencySchema, type TaskRevision, type Urgency } from '@naaseh/domain';

const urgencyValue = (value: unknown): Urgency | undefined => {
  const parsed = urgencySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const readableRevisionValues = (values: TaskRevision['before'] | TaskRevision['after']) =>
  Object.fromEntries(
    Object.entries(values ?? {}).map(([field, value]) => {
      if (field !== 'urgency') return [field, value];
      const urgency = urgencyValue(value);
      return [field, urgency ? urgencyLabels[urgency] : value];
    }),
  );

function UrgencyRevision({ revision }: { revision: TaskRevision }) {
  if (!revision.changedFields.includes('urgency')) return null;
  const before = urgencyValue(revision.before?.urgency);
  const after = urgencyValue(revision.after.urgency);
  if (!after) return null;
  return before ? (
    <p className="revision-urgency">
      Priority changed from <strong>{urgencyLabels[before]}</strong> to{' '}
      <strong>{urgencyLabels[after]}</strong>.
    </p>
  ) : (
    <p className="revision-urgency">
      Priority set to <strong>{urgencyLabels[after]}</strong>.
    </p>
  );
}

export function RevisionLog({ revisions }: { revisions: TaskRevision[] }) {
  return (
    <ol>
      {revisions.map((item) => (
        <li key={item.id}>
          {item.operation} by {item.actorId} at{' '}
          <time>{new Date(item.changedAt).toLocaleString()}</time> — {item.changedFields.join(', ')}
          . Sync: {item.syncOutcome}
          {item.sourceClientId ? `; client ${item.sourceClientId}` : ''}
          <UrgencyRevision revision={item} />
          {item.before ? (
            <details>
              <summary>Safe changes</summary>
              <pre>
                {JSON.stringify(
                  {
                    before: readableRevisionValues(item.before),
                    after: readableRevisionValues(item.after),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
