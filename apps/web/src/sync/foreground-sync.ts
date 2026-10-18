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

export const foregroundSyncIntervalMs = 120_000;

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
  const interval = input.target.setInterval(refresh, input.intervalMs ?? foregroundSyncIntervalMs);
  return () => {
    input.target.removeEventListener('focus', refresh);
    input.target.clearInterval(interval);
  };
}
