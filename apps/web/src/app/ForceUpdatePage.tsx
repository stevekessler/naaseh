import { useEffect, useRef, useState } from 'react';

export const isForceUpdatePath = (pathname: string) => /^\/force-update\/?$/u.test(pathname);

type AppShellStorage = Pick<CacheStorage, 'keys' | 'delete'>;
type ServiceWorkerContainerLike = Pick<ServiceWorkerContainer, 'getRegistrations'>;

export async function clearAppShell({
  serviceWorker,
  cacheStorage,
}: {
  serviceWorker?: ServiceWorkerContainerLike;
  cacheStorage?: AppShellStorage;
} = {}) {
  const registrations = serviceWorker ? await serviceWorker.getRegistrations() : [];
  const cacheNames = cacheStorage ? await cacheStorage.keys() : [];
  const results = await Promise.allSettled([
    ...registrations.map((registration) => registration.unregister()),
    ...cacheNames.map((name) => cacheStorage!.delete(name)),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) throw failure.reason;
}

export function ForceUpdatePage() {
  const started = useRef(false);
  const [error, setError] = useState('');

  const update = async () => {
    setError('');
    try {
      await clearAppShell({
        ...('serviceWorker' in navigator ? { serviceWorker: navigator.serviceWorker } : {}),
        ...('caches' in window ? { cacheStorage: window.caches } : {}),
      });
      // IndexedDB, localStorage, and the outbox are intentionally untouched.
      window.location.replace(`/?force-update=${Date.now()}`);
    } catch {
      setError(
        'The saved app files could not be cleared. Close Na’aseh, reopen it, and try again.',
      );
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void update();
  }, []);

  return (
    <main className="login-page">
      <section className="login-card" aria-live="polite">
        <h1>Updating Na’aseh</h1>
        <p>
          {error ||
            'Clearing the old app files and loading the latest version. Your saved offline work will be preserved.'}
        </p>
        {error && (
          <button type="button" onClick={() => void update()}>
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
