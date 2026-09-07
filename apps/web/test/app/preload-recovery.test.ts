import { describe, expect, it, vi } from 'vitest';
import { installPreloadRecovery } from '../../src/app/preload-recovery.js';

describe('preload recovery', () => {
  it('reloads only once when an open tab requests a replaced deployment chunk', () => {
    const listeners = new Map<string, EventListener>();
    const values = new Map<string, string>();
    const reload = vi.fn();
    const cleanup = installPreloadRecovery({
      addEventListener: vi.fn((name: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(name, listener as EventListener);
      }) as Window['addEventListener'],
      removeEventListener: vi.fn() as Window['removeEventListener'],
      reload,
      sessionStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
      setTimeout: vi.fn(() => 1) as unknown as Window['setTimeout'],
      clearTimeout: vi.fn() as unknown as Window['clearTimeout'],
    });
    const first = new Event('vite:preloadError', { cancelable: true });
    listeners.get('vite:preloadError')!(first);
    listeners.get('vite:preloadError')!(new Event('vite:preloadError', { cancelable: true }));

    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
