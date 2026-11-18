import {
  hostProtocol,
  type FeatureLocation,
  type FeatureModule,
  type ReleaseManifest,
} from '@naaseh/contacts-inventory-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router.js';
import { bindFeatureHost } from './adapters.js';
import { loadManifest, readCachedManifest, rememberManifest } from './loader.js';

export function useFeatureRelease(enabled: boolean, online: boolean) {
  const [loaded, setLoaded] = useState<ReleaseManifest | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((previous) => previous + 1), []);
  useEffect(() => {
    if (!enabled) {
      setLoaded(null);
      return;
    }
    const controller = new AbortController();
    const refreshOnForeground = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', refreshOnForeground);
    void loadManifest({
      request: fetch,
      cached: readCachedManifest(),
      online,
      signal: controller.signal,
    })
      .then((manifest) => {
        if (controller.signal.aborted) return;
        setLoaded((previous) =>
          previous?.releaseId === manifest?.releaseId ? previous : manifest,
        );
        if (online) void rememberManifest(manifest, controller.signal).catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', refreshOnForeground);
    };
  }, [enabled, online, refresh, revision]);

  return { manifest: enabled ? loaded : null, refresh };
}

export function FeatureView({
  manifest,
  location: featureLocation,
  userId,
  isAdmin,
  csrfToken,
  refresh,
  revalidateSession,
}: {
  manifest: ReleaseManifest | null;
  location: FeatureLocation;
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  refresh: () => void;
  revalidateSession: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!manifest || !element || (featureLocation.page === 'catalog' && !isAdmin)) return;
    setFailed(false);
    let active = true;
    let unmount: (() => void) | undefined;
    const adapters = bindFeatureHost({
      releaseId: manifest.releaseId,
      userId,
      isAdmin,
      csrfToken,
      recheckRelease: refresh,
      revalidateSession,
      navigate(target) {
        switch (target.page) {
          case 'contacts':
          case 'inventory':
            navigate({
              section: target.page,
              ...(target.recordId ? { recordId: target.recordId } : {}),
            });
            break;
          case 'medication-list':
            navigate({ section: 'inventory', medicationList: true });
            break;
          case 'catalog':
            navigate({ section: 'inventory-admin', catalog: target.catalog });
            break;
        }
      },
    });
    // The manifest parser restricts the URL to same-origin immutable assets of this release.
    void import(/* @vite-ignore */ manifest.entry)
      .then((module: Partial<FeatureModule>) => {
        if (!active) return;
        if (module.protocol !== hostProtocol || typeof module.mount !== 'function') {
          setFailed(true);
          return;
        }
        unmount = module.mount(element, featureLocation, adapters.host);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      try {
        adapters.close();
      } finally {
        unmount?.();
      }
    };
  }, [csrfToken, featureLocation, isAdmin, manifest, refresh, revalidateSession, userId]);

  const unavailable = !manifest || failed || (featureLocation.page === 'catalog' && !isAdmin);
  return (
    <>
      {unavailable && <p role="status">This Contacts and Inventory page is unavailable.</p>}
      <div ref={container} hidden={unavailable} />
    </>
  );
}
