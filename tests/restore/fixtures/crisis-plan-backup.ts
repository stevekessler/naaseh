import { crisisPlanGrantFixture, crisisPlanRecordFixture } from '../../fixtures/crisis-plan.js';

export const crisisPlanBackupFixture = () => ({
  plan: crisisPlanRecordFixture(),
  shares: [
    {
      planId: crisisPlanRecordFixture().planId,
      ownerId: 'owner-1',
      recipientId: 'recipient-1',
      version: 1,
      state: 'active' as const,
      grant: crisisPlanGrantFixture(),
      updatedAt: '2026-08-29T12:00:00.000Z',
    },
  ],
  mutationReceipts: [
    { ownerId: 'owner-1', mutationId: '33333333-3333-4333-8333-333333333333', version: 1 },
  ],
  containsPlaintext: false,
});
