export interface ForegroundSyncTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  setInterval(handler: () => void, timeout: number): number;
  clearInterval(handle: number): void;
}

export interface ForegroundSyncDocument {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export const foregroundSyncIntervalMs = 60_000;

/**
 * Refresh incremental data when a person returns to an already-open client.
 * The periodic check is only a safety net and is suppressed for hidden tabs.
 */
export function installForegroundSync(input: {
  target: ForegroundSyncTarget;
  document: ForegroundSyncDocument;
  synchronize: () => void | Promise<void>;
  intervalMs?: number;
}) {
  const refresh = () => {
    if (input.document.visibilityState === 'visible') void input.synchronize();
  };
  input.target.addEventListener('focus', refresh);
  // Mobile Safari commonly resumes an existing tab without dispatching focus.
  // visibilitychange covers app switching, while pageshow also covers restoring
  // a tab from the back-forward cache.
  input.document.addEventListener('visibilitychange', refresh);
  input.target.addEventListener('pageshow', refresh);
  const interval = input.target.setInterval(refresh, input.intervalMs ?? foregroundSyncIntervalMs);
  return () => {
    input.target.removeEventListener('focus', refresh);
    input.document.removeEventListener('visibilitychange', refresh);
    input.target.removeEventListener('pageshow', refresh);
    input.target.clearInterval(interval);
  };
}
