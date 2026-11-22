import { useEffect, useState } from 'react';
import {
  hostProtocol,
  type FeatureModule,
  type FeatureSearch,
  type ReleaseManifest,
} from '@naaseh/contacts-inventory-contracts';
import { bindFeatureHost } from './adapters.js';

export interface FeatureSearchSession {
  manifest: ReleaseManifest;
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  refresh: () => void;
  revalidateSession: () => void;
}

export function useFeatureSearch(session: FeatureSearchSession | undefined, enabled: boolean) {
  const [current, setCurrent] = useState<{ key: string; query: FeatureSearch }>();
  const release = session?.manifest.releaseId;
  const entry = session?.manifest.entry;
  const userId = session?.userId;
  const isAdmin = session?.isAdmin;
  const csrfToken = session?.csrfToken;
  const refresh = session?.refresh;
  const revalidateSession = session?.revalidateSession;
  const key = userId && release ? JSON.stringify([userId, release, csrfToken]) : undefined;

  useEffect(() => {
    setCurrent(undefined);
    if (
      !enabled ||
      !key ||
      !entry ||
      !release ||
      !userId ||
      isAdmin === undefined ||
      !csrfToken ||
      !refresh ||
      !revalidateSession
    )
      return;
    const adapters = bindFeatureHost({
      releaseId: release,
      userId,
      isAdmin,
      csrfToken,
      recheckRelease: refresh,
      revalidateSession,
      navigate: () => {},
    });
    let active = true;
    let dispose: (() => void) | undefined;
    void import(/* @vite-ignore */ entry)
      .then((module: Partial<FeatureModule>) => {
        if (
          active &&
          module.protocol === hostProtocol &&
          typeof module.watchSearch === 'function'
        ) {
          dispose = module.watchSearch(adapters.host, (query) => {
            if (active) setCurrent(query ? { key, query } : undefined);
          });
        }
      })
      .catch(() => {
        if (active) setCurrent(undefined);
      });
    return () => {
      active = false;
      dispose?.();
      adapters.close();
    };
  }, [enabled, key, entry, release, userId, isAdmin, csrfToken, refresh, revalidateSession]);

  return enabled && current?.key === key ? current?.query : undefined;
}
