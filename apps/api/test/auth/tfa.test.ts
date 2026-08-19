import { DecryptCommand, EncryptCommand } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';
import { Secret, TOTP } from 'otpauth';
import {
  digestRecoveryCode,
  createTfaSecretCrypto,
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

  it('binds encrypted factors to their user and purpose on encrypt and decrypt', async () => {
    const send = vi.fn(async (command: EncryptCommand | DecryptCommand) =>
      command instanceof EncryptCommand
        ? { CiphertextBlob: Uint8Array.from([1, 2, 3]) }
        : { Plaintext: Buffer.from('SECRET', 'utf8') },
    );
    const crypto = createTfaSecretCrypto(send);

    await expect(crypto.encrypt('user-1', 'SECRET')).resolves.toBe('AQID');
    await expect(crypto.decrypt('user-1', 'AQID')).resolves.toBe('SECRET');

    expect(send).toHaveBeenCalledTimes(2);
    for (const [command] of send.mock.calls)
      expect(command.input.EncryptionContext).toEqual({ purpose: 'naaseh-totp', userId: 'user-1' });
  });
});
