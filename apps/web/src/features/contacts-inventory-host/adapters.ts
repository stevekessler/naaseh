import {
  featureApiPrefix,
  type FeatureHost,
  type FeatureLifecycle,
} from '@naaseh/contacts-inventory-contracts';
import { decryptLocalValue, encryptLocalValue } from '../../db/task-repository.js';

export function bindFeatureHost({
  releaseId,
  userId,
  isAdmin,
  csrfToken,
  navigate,
  recheckRelease,
  revalidateSession,
}: {
  releaseId: string;
  userId: string;
  isAdmin: boolean;
  csrfToken: string;
  navigate: FeatureHost['navigate'];
  recheckRelease: () => void;
  revalidateSession: () => void;
}) {
  const controller = new AbortController();
  const listeners = new Set<(event: FeatureLifecycle) => void>();
  const prefix = featureApiPrefix(releaseId);
  const namespace = 'contacts-inventory';
  const publish = (event: FeatureLifecycle) => {
    for (const listener of listeners) listener(event);
  };
  const host: FeatureHost = {
    userId,
    isAdmin,
    navigate: (location) => {
      controller.signal.throwIfAborted();
      navigate(location);
    },
    async request(path, options = {}) {
      controller.signal.throwIfAborted();
      const [pathname] = path.split('?', 1);
      if (!pathname || !/^\/[\w-]+(?:\/[\w-]+)*$/u.test(pathname) || path.includes('#')) {
        throw new Error('Invalid Contacts and Inventory request path.');
      }

      const method = (options.method ?? 'GET').toUpperCase();
      const headers = new Headers(options.headers);
      headers.delete('x-csrf-token');
      if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', csrfToken);
      const response = await fetch(`${prefix.slice(0, -1)}${path}`, {
        ...options,
        method,
        headers,
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        signal: options.signal
          ? AbortSignal.any([options.signal, controller.signal])
          : controller.signal,
      });
      controller.signal.throwIfAborted();
      if (response.status === 401) revalidateSession();
      if ([404, 410, 503].includes(response.status)) recheckRelease();
      return response;
    },
    async encrypt(slot, value) {
      controller.signal.throwIfAborted();
      const ciphertext = await encryptLocalValue(namespace, JSON.stringify([userId, slot]), value);
      controller.signal.throwIfAborted();
      return JSON.stringify(ciphertext);
    },
    async decrypt(slot, value) {
      controller.signal.throwIfAborted();
      const plaintext = await decryptLocalValue<string>(
        namespace,
        JSON.stringify([userId, slot]),
        JSON.parse(value),
      );
      controller.signal.throwIfAborted();
      return plaintext;
    },
    subscribe(listener) {
      controller.signal.throwIfAborted();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const foreground = () => {
    if (document.visibilityState === 'visible') publish('foreground');
  };
  const reconnect = () => publish('reconnect');
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', foreground);
  return {
    host,
    close() {
      controller.abort();
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', foreground);
      try {
        publish('lock');
      } finally {
        listeners.clear();
      }
    },
  };
}
