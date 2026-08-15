import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  factorChangeProofSchema,
  loginRequestSchema,
  passwordResetRequestSchema,
  profileSecurityResponseSchema,
  provisionUserSchema,
  tfaChallengeRequestSchema,
  tfaNextStepSchema,
} from '@naaseh/contracts';

const contract = readFileSync('specs/001-naaseh-v1-baseline/contracts/openapi.yaml', 'utf8');

describe('authentication HTTP contract', () => {
  it('defines login, session, logout, generic failures, and hardened session cookies', () => {
    for (const value of [
      '/auth/login:',
      '/auth/session:',
      '/auth/logout:',
      'GenericAuthenticationFailure',
      '__Host-naaseh',
    ])
      expect(contract).toContain(value);
  });

  it('keeps login inputs strict and rejects privilege injection', () => {
    expect(loginRequestSchema.safeParse({ username: 'steve', password: 'secret' }).success).toBe(
      true,
    );
    expect(
      loginRequestSchema.safeParse({ username: 'steve', password: 'secret', role: 'admin' })
        .success,
    ).toBe(false);
  });

  it('requires backend provisioning credentials without permitting stored hashes', () => {
    expect(
      provisionUserSchema.safeParse({
        username: 'steve',
        password: 'a-secure-password',
        pin: '123456',
        displayName: 'Steve',
        role: 'admin',
      }).success,
    ).toBe(true);
    expect(
      provisionUserSchema.safeParse({
        username: 'steve',
        password: 'a-secure-password',
        pin: '123456',
        displayName: 'Steve',
        passwordHash: 'stolen',
      }).success,
    ).toBe(false);
  });

  it('keeps factor and password-reset payloads strict and bounded', () => {
    expect(tfaChallengeRequestSchema.parse({ method: 'totp', code: '123456' })).toEqual({
      method: 'totp',
      code: '123456',
    });
    expect(
      factorChangeProofSchema.safeParse({
        password: 'secret',
        method: 'totp',
        code: '123456',
        sessionToken: 'must-not-be-accepted',
      }).success,
    ).toBe(false);
    expect(
      passwordResetRequestSchema.safeParse({
        username: 'steve',
        pin: '123456',
        newPassword: 'a-new-secure-password',
        confirmPassword: 'a-new-secure-password',
      }).success,
    ).toBe(true);
  });

  it('exposes only safe TFA next-step and profile summaries', () => {
    expect(
      tfaNextStepSchema.parse({ next: 'tfa_challenge', expiresAt: '2026-08-14T18:05:00.000Z' }),
    ).toEqual(expect.objectContaining({ next: 'tfa_challenge' }));
    expect(
      profileSecurityResponseSchema.safeParse({
        tfaStatus: 'enabled',
        enrolledAt: '2026-08-14T18:00:00.000Z',
        recoveryCodesRemaining: 9,
        secretCiphertext: 'must-not-be-exposed',
      }).success,
    ).toBe(false);
  });
});
