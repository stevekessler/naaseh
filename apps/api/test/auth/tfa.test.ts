import { describe, expect, it } from 'vitest';
import { Secret, TOTP } from 'otpauth';
import {
  digestRecoveryCode,
  generateRecoveryCodes,
  verifyTotp,
} from '../../src/auth/tfa-crypto.js';

describe('TFA cryptographic rules', () => {
  const secret = Secret.fromBase32('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
  const now = new Date('2026-08-14T18:00:00.000Z');

  it('accepts a current TOTP once and rejects replayed counters', () => {
    const token = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 }).generate({
      timestamp: now.getTime(),
    });
    const accepted = verifyTotp({ secretBase32: secret.base32, token, now });
    expect(accepted).toEqual({ counter: Math.floor(now.getTime() / 30_000) });
    expect(
      verifyTotp({
        secretBase32: secret.base32,
        token,
        now,
        lastAcceptedCounter: accepted?.counter,
      }),
    ).toBeUndefined();
  });

  it('generates ten unique one-use recovery values and stores only digests', () => {
    const codes = generateRecoveryCodes(() => crypto.getRandomValues(new Uint8Array(20)));
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(digestRecoveryCode(codes[0]!)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestRecoveryCode(codes[0]!)).not.toContain(codes[0]!);
  });
});
