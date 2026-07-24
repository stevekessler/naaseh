import { beforeEach, describe, expect, it } from 'vitest';
import { redact } from '@naaseh/observability';
import { canAttempt, clearFailures, registerFailure } from '../../apps/api/src/auth/rate-limit.js';

describe('authentication security controls', () => {
  beforeEach(() => clearFailures('account:steve'));

  it('redacts credentials, PINs, cookies, and nested tokens', () => {
    const serialized = JSON.stringify(
      redact({
        password: 'password-secret',
        pin: '123456',
        cookie: 'session-secret',
        nested: { token: 'csrf-secret' },
      }),
    );
    expect(serialized).not.toMatch(/password-secret|123456|session-secret|csrf-secret/);
  });

  it('applies escalating delay without exposing whether an account exists', () => {
    const first = registerFailure('account:steve', 1_000);
    const second = registerFailure('account:steve', 1_000);
    expect(second).toBeGreaterThan(first);
    expect(canAttempt('account:steve', 1_000)).toBe(false);
    expect(canAttempt('account:steve', 1_000 + second)).toBe(true);
  });
});
