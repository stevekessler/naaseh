import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPinRecoveryService,
  PinRecoveryError,
  type PinRecoveryDependencies,
} from '../../apps/api/src/crypto-recovery/pin-recovery.js';

function fixture(overrides: Partial<PinRecoveryDependencies> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dek = new Uint8Array(32).fill(7);
  const mutablePlaintext = new Uint8Array(dek);
  const audit = vi.fn<PinRecoveryDependencies['audit']>();
  const dependencies: PinRecoveryDependencies = {
    reverifyPassword: vi.fn(async () => true),
    consumeAttempt: vi.fn(async () => true),
    decryptRecoveryWrap: vi.fn(async () => mutablePlaintext),
    audit,
    now: vi.fn(() => 1_000),
    ...overrides,
  };
  const request = {
    actorId: 'owner-1',
    ownerId: 'owner-1',
    taskId: 'task-1',
    memoId: 'memo-1',
    password: 'correct horse battery staple',
    csrfValidated: true,
    reason: 'Forgotten PIN',
    wrappedDek: Buffer.from('kms-ciphertext').toString('base64url'),
    kmsKeyId: 'arn:aws:kms:us-west-2:111122223333:key/example',
    kmsKeyVersion: 'recovery-v2',
    authority: 'recovery' as const,
    ephemeralPublicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
  };
  return { dependencies, request, privateKey, dek, mutablePlaintext, audit };
}

describe('owner-mediated hidden memo recovery', () => {
  it('re-verifies the owner and returns the DEK only encrypted to the ephemeral browser key', async () => {
    const { dependencies, request, privateKey, dek, mutablePlaintext, audit } = fixture();
    const recover = createPinRecoveryService(dependencies);

    const result = await recover(request);
    expect(result.encryptedDek).not.toBe(Buffer.from(dek).toString('base64url'));
    expect(
      privateDecrypt(
        {
          key: privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(result.encryptedDek, 'base64url'),
      ),
    ).toEqual(Buffer.from(dek));
    expect(mutablePlaintext).toEqual(new Uint8Array(32));
    expect(dependencies.reverifyPassword).toHaveBeenCalledWith(request.actorId, request.password);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: request.actorId,
        memoId: request.memoId,
        authority: 'recovery',
        outcome: 'success',
      }),
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain(request.password);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(request.wrappedDek);
  });

  it.each([
    ['different owner', { ownerId: 'other-owner' }],
    ['missing CSRF validation', { csrfValidated: false }],
    ['missing recovery reason', { reason: ' ' }],
  ])('denies %s before KMS decrypt', async (_label, requestPatch) => {
    const { dependencies, request } = fixture();
    const recover = createPinRecoveryService(dependencies);
    await expect(recover({ ...request, ...requestPatch })).rejects.toMatchObject({
      code: 'denied',
      status: 403,
    });
    expect(dependencies.decryptRecoveryWrap).not.toHaveBeenCalled();
  });

  it('uses the same safe denial for a wrong password and enforces attempt throttling', async () => {
    const wrongPassword = fixture({ reverifyPassword: vi.fn(async () => false) });
    await expect(
      createPinRecoveryService(wrongPassword.dependencies)(wrongPassword.request),
    ).rejects.toBeInstanceOf(PinRecoveryError);
    expect(wrongPassword.dependencies.decryptRecoveryWrap).not.toHaveBeenCalled();

    const throttled = fixture({ consumeAttempt: vi.fn(async () => false) });
    await expect(
      createPinRecoveryService(throttled.dependencies)(throttled.request),
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    expect(throttled.dependencies.reverifyPassword).not.toHaveBeenCalled();
  });

  it('rejects a weak or non-RSA browser key before decrypting the recovery wrap', async () => {
    const { dependencies, request } = fixture();
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await expect(
      createPinRecoveryService(dependencies)({
        ...request,
        ephemeralPublicKeySpki: publicKey
          .export({ format: 'der', type: 'spki' })
          .toString('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_key', status: 400 });
    expect(dependencies.decryptRecoveryWrap).not.toHaveBeenCalled();
  });
});
