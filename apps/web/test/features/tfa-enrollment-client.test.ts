import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTfaEnrollment } from '../../src/features/auth/security-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('TFA enrollment client', () => {
  it('starts the side-effecting enrollment operation with POST and no-store controls', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Naaseh:user' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(startTfaEnrollment()).resolves.toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP',
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/tfa/enrollment',
      expect.objectContaining({ method: 'POST', credentials: 'include', cache: 'no-store' }),
    );
  });
});
