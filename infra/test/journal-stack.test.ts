import { describe, expect, it } from 'vitest';
import { journalInfrastructureControls } from '../lib/journal-stack.js';
import { cryptoRecoveryControls } from '../lib/crypto-recovery-stack.js';
import { journalObservabilityControls } from '../lib/observability-stack.js';
import { backupControls } from '../lib/backup-stack.js';

describe('journal infrastructure controls', () => {
  it('uses the existing on-demand table and isolated single-concurrency recovery path', () => {
    expect(journalInfrastructureControls).toMatchObject({
      billing: 'PAY_PER_REQUEST',
      plaintextIndexes: 0,
      pointInTimeRecovery: true,
      noStoreResponses: true,
    });
    expect(cryptoRecoveryControls).toMatchObject({
      isolatedRole: true,
      reservedConcurrency: 1,
      journalOwnerBoundRewrap: true,
    });
    expect(journalObservabilityControls.protectedContentInLogs).toBe(false);
    expect(backupControls.journalCiphertextAndRecoveryAudit).toBe(true);
  });
});
