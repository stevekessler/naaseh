import { describe, expect, it, vi } from 'vitest';
import { createTfaService, requiredTfaNextStep } from '../../apps/api/src/auth/tfa-service.js';
import { recordAuthSecurityEvent } from '../../apps/api/src/auth/telemetry.js';
import type { StoredUser } from '../../apps/api/src/auth/user-repository.js';

describe('TFA and password reset security boundaries', () => {
  const admin: StoredUser = {
    id: 'admin-1',
    username: 'admin',
    displayName: 'Administrator',
    role: 'admin',
    active: true,
    sessionEpoch: 4,
    credentialVersion: 2,
    tfaStatus: 'enrollment_required',
    passwordHash: 'password-digest',
    pinHash: 'pin-digest',
    pepperVersion: '1',
    securityUpdatedAt: '2026-08-18T00:00:00.000Z',
    version: 3,
  };

  it('requires administrator enrollment and stores only encrypted/digested factor material', async () => {
    expect(requiredTfaNextStep(admin)).toBe('tfa_enrollment');
    const saveFactor = vi.fn(async () => undefined);
    const changeUserSecurity = vi.fn(async () => undefined);
    const service = createTfaService({
      getFactor: vi.fn(async () => undefined),
      saveFactor,
      decryptSecret: vi.fn(async () => 'unused'),
      encryptSecret: vi.fn(async () => 'kms-ciphertext'),
      advanceCounter: vi.fn(async () => undefined),
      changeUserSecurity,
    });

    const recoveryCodes = await service.enableFactor(admin, 'plaintext-bootstrap-secret');

    expect(recoveryCodes).toHaveLength(10);
    const stored = saveFactor.mock.calls[0]?.[0];
    expect(stored?.secretCiphertext).toBe('kms-ciphertext');
    expect(JSON.stringify(stored)).not.toContain('plaintext-bootstrap-secret');
    for (const code of recoveryCodes) expect(JSON.stringify(stored)).not.toContain(code);
    expect(changeUserSecurity).toHaveBeenCalledWith(
      admin.id,
      expect.objectContaining({ tfaStatus: 'enabled', nextSessionEpoch: 5 }),
    );
  });

  it('records password reset requests as accepted without logging submitted secrets', () => {
    const sink = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordAuthSecurityEvent('password_reset_request', 'accepted', 'correlation-1');
    const output = sink.mock.calls.flat().join('\n');
    expect(output).toContain('password_reset_request');
    expect(output).toContain('accepted');
    expect(output).not.toMatch(/password-digest|pin-digest|plaintext-bootstrap-secret/);
  });
});
