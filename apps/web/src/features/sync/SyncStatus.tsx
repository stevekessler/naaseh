export function SyncStatus({
  online,
  pending,
  conflicts = 0,
  error,
  retry,
  reviewConflicts,
}: {
  online: boolean;
  pending: number;
  conflicts?: number;
  error?: string | undefined;
  retry: () => void;
  reviewConflicts?: () => void;
}) {
  return (
    <div className="sync-status" role="status">
      <span className="sync-status-summary">
        {!online
          ? `Offline${pending ? ` · ${pending} pending` : ''}`
          : error
            ? 'Sync failed'
            : conflicts
              ? `${conflicts} conflict${conflicts === 1 ? '' : 's'}`
              : pending
                ? `${pending} pending`
                : 'Synced'}
      </span>
      {conflicts > 0 && reviewConflicts && (
        <button onClick={reviewConflicts}>Review conflicts ({conflicts})</button>
      )}
      {error && (
        <div className="sync-status-error" role="alert">
          <span>{error}</span>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </div>
  );
}
