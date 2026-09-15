import { announceServiceWorkerUpdate } from './service-worker-update.js';

/** Install the new shell even when an older client's synchronization is broken. */
export async function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let currentWorker = navigator.serviceWorker.controller;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    });
    const announce = () => {
      if (!registration.active) return;
      if (currentWorker && registration.active !== currentWorker)
        announceServiceWorkerUpdate(() => window.location.reload());
      currentWorker = registration.active;
    };
    const watch = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'activated') announce();
      });
    };
    registration.addEventListener('updatefound', watch);
    watch();
    announce();
    // Also find releases when a phone resumes a long-lived tab.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {});
    });
  } catch {
    // The current app remains usable if registration is unavailable or offline.
  }
}
