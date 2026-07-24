import { createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { recoveryAudit } from './telemetry.js';

const MAX_REAUTHENTICATION_AGE_MS = 5 * 60_000;

export interface PinRecoveryRequest {
  actorId: string;
  ownerId: string;
  taskId: string;
  memoId: string;
  password: string;
  csrfValidated: boolean;
  reason: string;
  wrappedDek: string;
  kmsKeyId: string;
  kmsKeyVersion: string;
  authority: 'recovery';
  ephemeralPublicKeySpki: string;
}

export interface PinRecoveryResult {
  region: 'us-west-2';
  algorithm: 'RSA-OAEP-256';
  encryptedDek: string;
  kmsKeyVersion: string;
  authority: 'recovery';
}

export interface PinRecoveryDependencies {
  reverifyPassword(actorId: string, password: string): Promise<boolean>;
  consumeAttempt(actorId: string): Promise<boolean>;
  decryptRecoveryWrap(input: { ciphertext: Uint8Array; keyId: string }): Promise<Uint8Array>;
  audit(event: {
    operation: 'pin-recovery';
    actorId: string;
    ownerId: string;
    taskId: string;
    memoId: string;
    authority: string;
    keyVersion: string;
    outcome: 'success' | 'denied' | 'failure';
    elapsedMs: number;
  }): void;
  now(): number;
}

export class PinRecoveryError extends Error {
  constructor(
    readonly code: 'denied' | 'rate_limited' | 'invalid_key' | 'dependency_failure',
    readonly status: number,
  ) {
    super(
      code === 'rate_limited'
        ? 'Recovery is temporarily unavailable.'
        : 'Recovery could not be completed.',
    );
    this.name = 'PinRecoveryError';
  }
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length === 0) throw new Error('empty');
    return decoded;
  } catch {
    throw new PinRecoveryError('invalid_key', 400);
  }
}

function validatedEphemeralKey(spki: string) {
  try {
    const key = createPublicKey({
      key: Buffer.from(spki, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not-rsa');
    const modulusLength = key.asymmetricKeyDetails?.modulusLength ?? 0;
    if (modulusLength < 2048) throw new Error('rsa-too-small');
    return key;
  } catch {
    throw new PinRecoveryError('invalid_key', 400);
  }
}

/**
 * The decrypted DEK exists only inside this isolated operation. It is immediately
 * encrypted to the browser's one-use RSA key and its mutable buffer is cleared.
 */
export function createPinRecoveryService(dependencies: PinRecoveryDependencies) {
  return async (request: PinRecoveryRequest): Promise<PinRecoveryResult> => {
    const startedAt = dependencies.now();
    const audit = (outcome: 'success' | 'denied' | 'failure') =>
      dependencies.audit({
        operation: 'pin-recovery',
        actorId: request.actorId,
        ownerId: request.ownerId,
        taskId: request.taskId,
        memoId: request.memoId,
        authority: request.authority,
        keyVersion: request.kmsKeyVersion,
        outcome,
        elapsedMs: Math.max(0, dependencies.now() - startedAt),
      });

    if (!request.csrfValidated || request.actorId !== request.ownerId || !request.reason.trim()) {
      audit('denied');
      throw new PinRecoveryError('denied', 403);
    }
    if (!(await dependencies.consumeAttempt(request.actorId))) {
      audit('denied');
      throw new PinRecoveryError('rate_limited', 429);
    }
    if (!(await dependencies.reverifyPassword(request.actorId, request.password))) {
      audit('denied');
      throw new PinRecoveryError('denied', 403);
    }

    const ephemeralKey = validatedEphemeralKey(request.ephemeralPublicKeySpki);
    let plaintext: Uint8Array | undefined;
    try {
      plaintext = await dependencies.decryptRecoveryWrap({
        ciphertext: decodeBase64(request.wrappedDek),
        keyId: request.kmsKeyId,
      });
      if (plaintext.byteLength !== 32) throw new PinRecoveryError('dependency_failure', 502);
      const encryptedDek = publicEncrypt(
        {
          key: ephemeralKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        plaintext,
      ).toString('base64url');
      audit('success');
      return {
        region: 'us-west-2',
        algorithm: 'RSA-OAEP-256',
        encryptedDek,
        kmsKeyVersion: request.kmsKeyVersion,
        authority: request.authority,
      };
    } catch (error) {
      if (error instanceof PinRecoveryError) {
        audit('failure');
        throw error;
      }
      audit('failure');
      throw new PinRecoveryError('dependency_failure', 502);
    } finally {
      plaintext?.fill(0);
    }
  };
}

const kms = new KMSClient({});

export async function decryptWithRecoveryKms(input: {
  ciphertext: Uint8Array;
  keyId: string;
}): Promise<Uint8Array> {
  const result = await kms.send(
    new DecryptCommand({
      KeyId: input.keyId,
      CiphertextBlob: input.ciphertext,
      EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
    }),
  );
  if (!result.Plaintext) throw new PinRecoveryError('dependency_failure', 502);
  return new Uint8Array(result.Plaintext);
}

export const defaultRecoveryAudit: PinRecoveryDependencies['audit'] = (event) =>
  recoveryAudit(event.operation, event.actorId, event.outcome, {
    ownerId: event.ownerId,
    taskId: event.taskId,
    memoId: event.memoId,
    authority: event.authority,
    keyVersion: event.keyVersion,
    elapsedMs: event.elapsedMs,
  });

export { MAX_REAUTHENTICATION_AGE_MS };
