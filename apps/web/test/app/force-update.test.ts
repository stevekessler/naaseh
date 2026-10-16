import { describe, expect, it, vi } from 'vitest';
import { clearAppShell, isForceUpdatePath } from '../../src/app/ForceUpdatePage.js';

describe('force update recovery', () => {
  it('recognizes only the dedicated recovery route', () => {
    expect(isForceUpdatePath('/force-update')).toBe(true);
    expect(isForceUpdatePath('/force-update/')).toBe(true);
    expect(isForceUpdatePath('/tasks')).toBe(false);
    expect(isForceUpdatePath('/force-update/anything')).toBe(false);
  });

  it('unregisters workers and clears shell caches without touching persistent app data', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);
    const keys = vi.fn().mockResolvedValue(['precache', 'runtime']);

    await clearAppShell({
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      } as unknown as ServiceWorkerContainer,
      cacheStorage: { keys, delete: deleteCache },
    });

    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('precache');
    expect(deleteCache).toHaveBeenCalledWith('runtime');
  });
});
