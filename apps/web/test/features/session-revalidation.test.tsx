import { describe, expect, it, vi } from 'vitest';
import { revalidateProtectedSession } from '../../src/features/auth/session.js';

describe('protected session revalidation', () => {
  it('locks before validation and purges revoked data before exposing signed-out UI', async () => {
    const order: string[] = [];
    await revalidateProtectedSession({
      lock: () => order.push('lock'),
      validate: vi.fn(async () => ({ valid: false as const, reason: 'revoked' as const })),
      purge: vi.fn(async () => order.push('purge')),
      unlock: () => order.push('unlock'),
    });
    expect(order).toEqual(['lock', 'purge']);
  });

  it('keeps data locked and returns retry guidance when purge fails', async () => {
    await expect(
      revalidateProtectedSession({
        lock: vi.fn(),
        validate: vi.fn(async () => ({ valid: false as const, reason: 'revoked' as const })),
        purge: vi.fn(async () => {
          throw new Error('storage unavailable');
        }),
        unlock: vi.fn(),
      }),
    ).resolves.toEqual({ status: 'purge_failed', retryable: true });
  });

  it('returns the refreshed server session after successful validation', async () => {
    const session = {
      userId: 'user-1',
      displayName: 'Smoke User',
      csrfToken: 'fresh-csrf',
      role: 'user' as const,
    };
    await expect(
      revalidateProtectedSession({
        lock: vi.fn(),
        validate: vi.fn(async () => ({ valid: true as const, session })),
        purge: vi.fn(),
        unlock: vi.fn(),
      }),
    ).resolves.toEqual({ status: 'valid', retryable: false, session });
  });

  it('does not restore a session when sign-out begins during revalidation', async () => {
    let finishValidation!: (value: {
      valid: true;
      session: {
        userId: string;
        displayName: string;
        csrfToken: string;
        role: 'user';
      };
    }) => void;
    const validation = new Promise<Parameters<typeof finishValidation>[0]>((resolve) => {
      finishValidation = resolve;
    });
    let signingOut = false;
    const unlock = vi.fn();
    const pending = revalidateProtectedSession({
      lock: vi.fn(),
      validate: () => validation,
      purge: vi.fn(),
      unlock,
      cancelled: () => signingOut,
    });

    signingOut = true;
    finishValidation({
      valid: true,
      session: {
        userId: 'smoke-user',
        displayName: 'Production Smoke Test',
        csrfToken: 'csrf',
        role: 'user',
      },
    });

    await expect(pending).resolves.toEqual({ status: 'cancelled', retryable: false });
    expect(unlock).not.toHaveBeenCalled();
  });
});
