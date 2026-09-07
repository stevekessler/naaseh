import { describe, expect, it, vi } from 'vitest';
import { signOutBrowser } from '../../src/features/auth/sign-out.js';

describe('browser sign-out', () => {
  it('uses a refreshed CSRF token and clears all local authorized data', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'fresh-csrf' }) })
      .mockResolvedValueOnce({ ok: true });
    const purge = vi.fn(async () => undefined);
    const clearSession = vi.fn();

    await signOutBrowser('stale-csrf', { request, purge, clearSession });

    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/logout',
      expect.objectContaining({ headers: { 'x-csrf-token': 'fresh-csrf' } }),
    );
    expect(purge).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it('still clears local data when the server is unavailable', async () => {
    const purge = vi.fn(async () => undefined);
    const clearSession = vi.fn();
    await signOutBrowser(undefined, {
      request: vi.fn(async () => {
        throw new Error('offline');
      }),
      purge,
      clearSession,
    });
    expect(purge).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
  });
});
