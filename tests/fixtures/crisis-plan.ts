import type {
  CrisisPlanCiphertext,
  CrisisPlanOwnerWrap,
  CrisisPlanRecipientGrant,
  CrisisPlanRecord,
} from '@naaseh/domain';

const encoded = (length: number, value = 'A') => value.repeat(length);
export const crisisPlanOwnerFixture = (
  overrides: Partial<{ id: string; displayName: string; username: string }> = {},
) => ({ id: 'owner-1', displayName: 'Journal Owner', username: 'owner', ...overrides });
export const crisisPlanRecipientFixture = (
  overrides: Partial<{ id: string; displayName: string; username: string; active: boolean }> = {},
) => ({
  id: 'recipient-1',
  displayName: 'Trusted Person',
  username: 'trusted',
  active: true,
  ...overrides,
});
export const crisisPlanCiphertextFixture = (
  overrides: Partial<CrisisPlanCiphertext> = {},
): CrisisPlanCiphertext => ({
  algorithm: 'AES-256-GCM',
  schemaVersion: 1,
  keyGeneration: 1,
  iv: encoded(16),
  ciphertext: encoded(32, 'B'),
  byteSize: 24,
  ...overrides,
});
export const crisisPlanOwnerWrapFixture = (
  overrides: Partial<CrisisPlanOwnerWrap> = {},
): CrisisPlanOwnerWrap => ({
  algorithm: 'JMK-HKDF-AES-256-GCM',
  keyGeneration: 1,
  iv: encoded(16, 'C'),
  ciphertext: encoded(32, 'D'),
  ...overrides,
});
export const crisisPlanGrantFixture = (
  overrides: Partial<CrisisPlanRecipientGrant> = {},
): CrisisPlanRecipientGrant => ({
  algorithm: 'RSA-OAEP-256',
  ownerId: 'owner-1',
  planId: '11111111-1111-4111-8111-111111111111' as CrisisPlanRecipientGrant['planId'],
  recipientId: 'recipient-1',
  shareVersion: 1,
  keyGeneration: 1,
  sharingKeyVersion: 1,
  ciphertext: encoded(512, 'E'),
  ...overrides,
});
export const crisisPlanRecordFixture = (
  overrides: Partial<CrisisPlanRecord> = {},
): CrisisPlanRecord => ({
  planId: '11111111-1111-4111-8111-111111111111' as CrisisPlanRecord['planId'],
  ownerId: 'owner-1',
  version: 1,
  keyGeneration: 1,
  rotationState: 'current',
  body: crisisPlanCiphertextFixture(),
  ownerWrap: crisisPlanOwnerWrapFixture(),
  createdAt: '2026-08-29T12:00:00.000Z',
  updatedAt: '2026-08-29T12:00:00.000Z',
  ...overrides,
});
export const crisisPlanJournalEntryFixture = () => ({
  entryId: '22222222-2222-4222-8222-222222222222',
  ownerId: 'owner-1',
  baseVersion: 0,
  requiresCurrentCrisisPlan: true,
});
