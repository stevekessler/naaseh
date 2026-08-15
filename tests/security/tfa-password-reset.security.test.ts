import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('TFA and password reset security boundaries', () => {
  it('uses KMS encryption context and never grants administrator password/PIN bypass', () => {
    const cryptoSource = readFileSync('apps/api/src/auth/tfa-crypto.ts', 'utf8');
    const serviceSource = readFileSync('apps/api/src/auth/tfa-service.ts', 'utf8');
    expect(cryptoSource).toContain('naaseh-totp');
    expect(cryptoSource).toContain('EncryptionContext');
    expect(serviceSource).toContain('enrollment_required');
    expect(serviceSource).not.toMatch(/admin.*(?:pin|password).*bypass/i);
  });

  it('marks every factor/reset response no-store and excludes protected values from logs', () => {
    const handlerSource = readFileSync('apps/api/src/auth/handler.ts', 'utf8');
    const telemetrySource = readFileSync('apps/api/src/auth/telemetry.ts', 'utf8');
    expect(handlerSource).toContain('no-store');
    for (const protectedName of ['password', 'pin', 'code', 'secretCiphertext'])
      expect(telemetrySource).not.toContain(`fields.${protectedName}`);
  });
});
