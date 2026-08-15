import { describe, expect, it, vi } from 'vitest';
import { createPasswordResetService } from '../../src/auth/password-reset-service.js';

describe('PIN password reset', () => {
  it('returns the same generic result for unknown users and wrong PINs', async () => {
    const verifyOrDummyPin = vi.fn(async () => false);
    const service = createPasswordResetService({
      findUser: vi.fn(async () => undefined),
      verifyOrDummyPin,
      hashNewPassword: vi.fn(),
      commitPasswordReset: vi.fn(),
      consumeAttempt: vi.fn(async () => true),
    });
    await expect(
      service.reset({
        username: 'unknown',
        pin: '123456',
        newPassword: 'a-new-secure-password',
        sourceKey: 'source',
      }),
    ).resolves.toEqual({ accepted: true });
    expect(verifyOrDummyPin).toHaveBeenCalled();
  });

  it('atomically increments credential and session epochs without disabling TFA', async () => {
    const commitPasswordReset = vi.fn(async () => undefined);
    const user = {
      id: 'user',
      username: 'steve',
      displayName: 'Steve',
      role: 'user' as const,
      active: true,
      sessionEpoch: 3,
      credentialVersion: 4,
      tfaStatus: 'enabled' as const,
      passwordHash: 'old',
      pinHash: 'pin',
      pepperVersion: '1',
      securityUpdatedAt: '2026-08-14T17:00:00.000Z',
      version: 2,
    };
    const service = createPasswordResetService({
      findUser: vi.fn(async () => user),
      verifyOrDummyPin: vi.fn(async () => true),
      hashNewPassword: vi.fn(async () => 'new-hash'),
      commitPasswordReset,
      consumeAttempt: vi.fn(async () => true),
    });
    await service.reset({
      username: 'steve',
      pin: '123456',
      newPassword: 'a-new-secure-password',
      sourceKey: 'source',
    });
    expect(commitPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user',
        passwordHash: 'new-hash',
        expectedVersion: 2,
        nextCredentialVersion: 5,
        nextSessionEpoch: 4,
        retainedTfaStatus: 'enabled',
      }),
    );
  });
});
