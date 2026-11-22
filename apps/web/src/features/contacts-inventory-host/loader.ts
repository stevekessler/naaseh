import {
  manifestPath,
  parseReleaseManifest,
  type ReleaseManifest,
} from '@naaseh/contacts-inventory-contracts';

export async function loadManifest({
  request,
  cached,
  online,
  signal,
}: {
  request: typeof fetch;
  cached: ReleaseManifest | null;
  online: boolean;
  signal?: AbortSignal;
}): Promise<ReleaseManifest | null> {
  try {
    const response = await request(manifestPath, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return null;
    return parseReleaseManifest(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    return online ? null : cached;
  }
}

const cachedManifestKey = 'naaseh:contacts-inventory:trusted-release';

export function readCachedManifest(): ReleaseManifest | null {
  try {
    return parseReleaseManifest(JSON.parse(localStorage.getItem(cachedManifestKey) ?? 'null'));
  } catch {
    return null;
  }
}

export async function rememberManifest(manifest: ReleaseManifest | null, signal: AbortSignal) {
  if (signal.aborted) return;
  if (!manifest) {
    localStorage.removeItem(cachedManifestKey);
    return;
  }

  // The worker caches only immutable release assets. Save the offline pointer after warming them.
  const assets = await Promise.all(
    manifest.assets.map((asset) =>
      fetch(asset, { credentials: 'omit', redirect: 'error', signal }),
    ),
  );
  if (!signal.aborted && assets.every((response) => response.ok)) {
    localStorage.setItem(cachedManifestKey, JSON.stringify(manifest));
  }
}
