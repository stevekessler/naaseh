import type { JournalKeyEnvelope } from '@naaseh/domain';
import {
  changeJournalPin,
  generateJournalMasterKey,
  verifiedActiveJournalRecoveryKey,
  wrapJournalMasterKeyForRecovery,
  wrapJournalMasterKeyWithPin,
  zeroizeJournalKey,
  type LocalJournalOwnerWrap,
} from '../../crypto/journal-crypto.js';
import { saveLocalJournalOwnerWrap } from '../../db/journal-repository.js';
import {
  fetchJournalRecoveryRegistry,
  findJournalKeyEnvelope,
  readJournalKeyEnvelope,
  writeJournalKeyEnvelope,
} from './journal-client.js';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
};

const sameEnvelope = (expected: JournalKeyEnvelope, actual: JournalKeyEnvelope) =>
  JSON.stringify(canonicalize(expected)) === JSON.stringify(canonicalize(actual));

export type JournalEnrollmentStage =
  | 'registry-load'
  | 'registry-verification'
  | 'owner-wrap'
  | 'recovery-wrap'
  | 'server-write'
  | 'server-read'
  | 'server-verification'
  | 'local-save';

const enrollmentStageLabels: Record<JournalEnrollmentStage, string> = {
  'registry-load': 'loading the recovery-key registry',
  'registry-verification': 'verifying the recovery-key registry',
  'owner-wrap': 'creating the PIN-protected key wrap',
  'recovery-wrap': 'creating the recovery key wrap',
  'server-write': 'saving the encrypted enrollment',
  'server-read': 'reading back the encrypted enrollment',
  'server-verification': 'verifying the saved enrollment',
  'local-save': 'saving the local encrypted key wrap',
};

export class JournalEnrollmentError extends Error {
  constructor(
    readonly stage: JournalEnrollmentStage,
    cause?: unknown,
  ) {
    super(
      `Journal creation stopped while ${enrollmentStageLabels[stage]}. No enrollment was saved.`,
      { cause },
    );
    this.name = 'JournalEnrollmentError';
  }
}

async function enrollmentStep<T>(
  stage: JournalEnrollmentStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new JournalEnrollmentError(stage, error);
  }
}

export interface JournalEnrollmentDependencies {
  fetchRegistry: typeof fetchJournalRecoveryRegistry;
  findEnvelope: typeof findJournalKeyEnvelope;
  readEnvelope: typeof readJournalKeyEnvelope;
  writeEnvelope: typeof writeJournalKeyEnvelope;
  saveLocalWrap: typeof saveLocalJournalOwnerWrap;
  now: () => string;
}

const defaultDependencies: JournalEnrollmentDependencies = {
  fetchRegistry: fetchJournalRecoveryRegistry,
  findEnvelope: findJournalKeyEnvelope,
  readEnvelope: readJournalKeyEnvelope,
  writeEnvelope: writeJournalKeyEnvelope,
  saveLocalWrap: saveLocalJournalOwnerWrap,
  now: () => new Date().toISOString(),
};

export async function restoreDurableJournalEnrollment(
  ownerId: string,
  dependencies: JournalEnrollmentDependencies = defaultDependencies,
) {
  const envelope = await dependencies.findEnvelope();
  if (envelope) {
    if (envelope.ownerId !== ownerId) throw new Error('The Journal enrollment owner is invalid.');
    await dependencies.saveLocalWrap(ownerId, envelope.ownerWrap);
  }
  return envelope;
}

export async function createDurableJournalEnrollment(
  ownerId: string,
  pin: string,
  csrfToken: string,
  dependencies: JournalEnrollmentDependencies = defaultDependencies,
) {
  const jmk = generateJournalMasterKey();
  try {
    const registry = await enrollmentStep('registry-load', () => dependencies.fetchRegistry());
    const recoveryKey = await enrollmentStep('registry-verification', () =>
      verifiedActiveJournalRecoveryKey(registry),
    );
    const ownerWrap = await enrollmentStep('owner-wrap', () =>
      wrapJournalMasterKeyWithPin(jmk, pin),
    );
    const recoveryWrap = await enrollmentStep('recovery-wrap', () =>
      wrapJournalMasterKeyForRecovery(jmk, recoveryKey.publicKeySpki, recoveryKey.keyVersion),
    );
    const now = dependencies.now();
    const envelope: JournalKeyEnvelope = {
      id: 'journal-key',
      ownerId,
      version: 1,
      keyVersion: recoveryKey.keyVersion,
      ownerWrap,
      recoveryWrap,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await enrollmentStep('server-write', () =>
      dependencies.writeEnvelope(envelope, csrfToken),
    );
    const durable = await enrollmentStep('server-read', () => dependencies.readEnvelope());
    if (!sameEnvelope(saved, durable)) throw new JournalEnrollmentError('server-verification');
    await enrollmentStep('local-save', () =>
      dependencies.saveLocalWrap(ownerId, durable.ownerWrap),
    );
    return { jmk, envelope: durable };
  } catch (error) {
    zeroizeJournalKey(jmk);
    throw error;
  }
}

export async function changeDurableJournalPin(
  ownerId: string,
  currentWrap: LocalJournalOwnerWrap,
  oldPin: string,
  newPin: string,
  csrfToken: string,
  dependencies: JournalEnrollmentDependencies = defaultDependencies,
) {
  const current = await dependencies.readEnvelope();
  if (current.ownerId !== ownerId) throw new Error('The Journal enrollment owner is invalid.');
  const ownerWrap = await changeJournalPin(currentWrap, oldPin, newPin);
  const next: JournalKeyEnvelope = {
    ...current,
    version: current.version + 1,
    ownerWrap,
    updatedAt: dependencies.now(),
  };
  const saved = await dependencies.writeEnvelope(next, csrfToken);
  const durable = await dependencies.readEnvelope();
  if (!sameEnvelope(saved, durable))
    throw new Error('The durable Journal PIN change could not be verified.');
  await dependencies.saveLocalWrap(ownerId, durable.ownerWrap);
  return durable;
}
