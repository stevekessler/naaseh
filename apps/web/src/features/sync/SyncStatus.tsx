export function SyncStatus({
  online,
  pending,
  conflicts = 0,
  error,
  retry,
}: {
  online: boolean;
  pending: number;
  conflicts?: number;
  error?: string | undefined;
  retry: () => void;
}) {
  return (
    <div role="status">
      <span>
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
      {error && (
        <>
          <span>{error}</span>
          <button onClick={retry}>Retry</button>
        </>
      )}
    </div>
  );
}
