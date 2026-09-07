const recoveryMarker = 'naaseh-preload-recovery-attempted';
const recoveryWindowMs = 15_000;

type PreloadRecoveryEnvironment = {
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
  reload: () => void;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  setTimeout: Window['setTimeout'];
  clearTimeout: Window['clearTimeout'];
};

/**
 * Recovers an already-open tab when a deployment has replaced a lazy-loaded,
 * content-hashed JavaScript file. Vite emits this event before surfacing the
 * failed dynamic import. Only one automatic reload is allowed so a real or
 * persistent failure falls through to the application error boundary.
 */
export function installPreloadRecovery(
  environment: PreloadRecoveryEnvironment = {
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    reload: () => window.location.reload(),
    sessionStorage: window.sessionStorage,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  },
) {
  const clearMarkerTimer = environment.setTimeout(
    () => environment.sessionStorage.removeItem(recoveryMarker),
    recoveryWindowMs,
  );
  const recover = (event: Event) => {
    event.preventDefault();
    if (environment.sessionStorage.getItem(recoveryMarker)) return;
    environment.sessionStorage.setItem(recoveryMarker, 'true');
    environment.reload();
  };
  environment.addEventListener('vite:preloadError', recover);
  return () => {
    environment.clearTimeout(clearMarkerTimer);
    environment.removeEventListener('vite:preloadError', recover);
  };
}
