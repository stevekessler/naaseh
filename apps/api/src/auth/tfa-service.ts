import { randomUUID } from 'node:crypto';
import type { StoredUser } from './user-repository.js';
import type { TfaFactorRecord } from './tfa-repository.js';
import {
  digestRecoveryCode,
  generateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotp,
} from './tfa-crypto.js';
import { SafeApiError } from '../shared/http.js';

export interface TfaServiceDependencies {
  getFactor: (userId: string) => Promise<TfaFactorRecord | undefined>;
  saveFactor: (factor: TfaFactorRecord) => Promise<void>;
  decryptSecret: (userId: string, ciphertext: string) => Promise<string>;
  encryptSecret: (userId: string, secret: string) => Promise<string>;
  advanceCounter: (userId: string, expectedVersion: number, counter: number) => Promise<void>;
  changeUserSecurity: (
    userId: string,
    change: {
      tfaStatus: StoredUser['tfaStatus'];
      tfaEnrolledAt?: string;
      nextSessionEpoch: number;
    },
  ) => Promise<void>;
  deleteFactor?: (userId: string) => Promise<void>;
}

export const requiredTfaNextStep = (
  user: StoredUser,
): 'tfa_challenge' | 'tfa_enrollment' | undefined => {
  if (user.tfaStatus === 'enabled') return 'tfa_challenge';
  if (user.role === 'admin' || user.tfaStatus === 'enrollment_required') return 'tfa_enrollment';
  return undefined;
};

export function createTfaService(dependencies: TfaServiceDependencies) {
  async function verifyFactor(user: StoredUser, method: 'totp' | 'recovery_code', code: string) {
    const factor = await dependencies.getFactor(user.id);
    if (!factor || factor.status !== 'enabled' || !factor.secretCiphertext) return false;
    if (method === 'totp') {
      const secret = await dependencies.decryptSecret(user.id, factor.secretCiphertext);
      const accepted = verifyTotp({
        secretBase32: secret,
        token: code,
        ...(factor.lastAcceptedCounter !== undefined
          ? { lastAcceptedCounter: factor.lastAcceptedCounter }
          : {}),
      });
      if (!accepted) return false;
      await dependencies.advanceCounter(user.id, factor.version, accepted.counter);
      return true;
    }
    const recovery = factor.recoveryCodes.find(
      (candidate) => !candidate.usedAt && verifyRecoveryCode(code, candidate.digest),
    );
    if (!recovery) return false;
    const now = new Date().toISOString();
    await dependencies.saveFactor({
      ...factor,
      recoveryCodes: factor.recoveryCodes.map((candidate) =>
        candidate.id === recovery.id ? { ...candidate, usedAt: now } : candidate,
      ),
      version: factor.version + 1,
      updatedAt: now,
    });
    return true;
  }

  async function enableFactor(user: StoredUser, secret: string) {
    const now = new Date().toISOString();
    const recoveryCodes = generateRecoveryCodes();
    const factor: TfaFactorRecord = {
      userId: user.id,
      status: 'enabled',
      secretCiphertext: await dependencies.encryptSecret(user.id, secret),
      recoveryCodes: recoveryCodes.map((code) => ({
        id: randomUUID(),
        digest: digestRecoveryCode(code),
      })),
      verifiedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await dependencies.saveFactor(factor);
    await dependencies.changeUserSecurity(user.id, {
      tfaStatus: 'enabled',
      tfaEnrolledAt: now,
      nextSessionEpoch: user.sessionEpoch + 1,
    });
    return recoveryCodes;
  }

  async function rotateRecoveryCodes(
    user: StoredUser,
    method: 'totp' | 'recovery_code',
    code: string,
  ) {
    if (!(await verifyFactor(user, method, code)))
      throw new SafeApiError(
        401,
        'authentication_failed',
        'Unable to verify credentials.',
        'authorization',
      );
    const factor = await dependencies.getFactor(user.id);
    if (!factor || factor.status !== 'enabled')
      throw new SafeApiError(
        401,
        'authentication_failed',
        'Unable to verify credentials.',
        'authorization',
      );
    const recoveryCodes = generateRecoveryCodes();
    const now = new Date().toISOString();
    await dependencies.saveFactor({
      ...factor,
      recoveryCodes: recoveryCodes.map((value) => ({
        id: randomUUID(),
        digest: digestRecoveryCode(value),
      })),
      version: factor.version + 1,
      updatedAt: now,
    });
    await dependencies.changeUserSecurity(user.id, {
      tfaStatus: 'enabled',
      ...(user.tfaEnrolledAt ? { tfaEnrolledAt: user.tfaEnrolledAt } : {}),
      nextSessionEpoch: user.sessionEpoch + 1,
    });
    return recoveryCodes;
  }

  async function disableFactor(user: StoredUser, method: 'totp' | 'recovery_code', code: string) {
    if (user.role === 'admin')
      throw new SafeApiError(
        403,
        'forbidden',
        'Administrators cannot disable two-factor authentication.',
        'authorization',
      );
    if (!(await verifyFactor(user, method, code)))
      throw new SafeApiError(
        401,
        'authentication_failed',
        'Unable to verify credentials.',
        'authorization',
      );
    await dependencies.deleteFactor?.(user.id);
    await dependencies.changeUserSecurity(user.id, {
      tfaStatus: 'disabled',
      nextSessionEpoch: user.sessionEpoch + 1,
    });
  }

  return { verifyFactor, enableFactor, rotateRecoveryCodes, disableFactor };
}
