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
});
