export const journalOwnerFixture = {
  ownerId: 'user-journal-owner',
  otherUserId: 'user-journal-other',
  entryId: '11111111-1111-4111-8111-111111111111',
  mutationId: '22222222-2222-4222-8222-222222222222',
  journalDate: '2026-08-29',
} as const;

export const encryptedEnvelopeFixture = {
  recordKind: 'projection',
  schemaVersion: 1,
  keyVersion: 1,
  iv: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAA',
  byteSize: 32,
} as const;

export const journalEntryFixture = {
  id: journalOwnerFixture.entryId,
  journalDate: journalOwnerFixture.journalDate,
  version: 1,
  suicidalThoughts: 3,
  selfHarmThoughts: null,
  hoursOfSleep: 7.5,
  suicidalBehaviors: 'no',
  selfHarmBehaviors: null,
} as const;

export const journalTaskFixture = {
  id: 'task-journal-reflection',
  title: 'Journal fixture task',
  completed: false,
  completedAt: null,
} as const;

export const journalRecoveryFixture = {
  requestId: 'journal-recovery-request-0001',
  reason: 'Owner requested access restoration',
  keyEnvelopeVersion: 1,
  recoveryKeyVersion: 1,
} as const;
