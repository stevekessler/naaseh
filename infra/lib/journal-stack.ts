export const journalInfrastructureControls = {
  dataPlane: 'existing-single-table',
  billing: 'PAY_PER_REQUEST',
  plaintextIndexes: 0,
  pointInTimeRecovery: true,
  noStoreResponses: true,
  ownerOnlyRoutes: true,
  deleteRoute: false,
  exportRoute: false,
  additionalAlwaysOnCompute: false,
  routes: [
    '/journal/key-envelope',
    '/sync/push',
    '/sync/pull',
    '/sync/bootstrap',
    '/journal/recovery/requests',
  ],
  alarms: [
    'journal-save-failure',
    'journal-sync-failure',
    'journal-authorization-denied',
    'journal-recovery-failure',
  ],
  logRetentionDays: 90,
} as const;

export const crisisPlanBackupControls = Object.freeze({
  recordKinds: ['crisisPlan', 'crisisPlanShare', 'crisisPlanGrant', 'crisisPlanMutationReceipt'],
  restoreInvariants: [
    'ciphertext-only',
    'monotonic-key-generation',
    'rotation-required-preserved',
    'revoked-access-not-resurrected',
  ],
  plaintextInspectionRequired: false,
});
