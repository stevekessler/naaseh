import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loginRequestSchema, provisionUserSchema } from '@naaseh/contracts';

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
});
