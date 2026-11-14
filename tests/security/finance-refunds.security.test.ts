import { describe, expect, it } from 'vitest';
import { buildExperienceFixture, EXPERIENCE_OTHER_GROUP_ID, experienceId } from '../fixtures/finance/experience.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  getExpenseRefundRelationship,
  putExpenseRefundRelationship,
} from '../../apps/api/src/finance/refund-service.js';

describe('refund/original access intersection', () => {
  it('requires edit access to the refund and independent read access to the original', () => {
    const fixture = buildExperienceFixture();
    const repository = new FinanceMemoryRepository();
    for (const account of fixture.accounts) repository.accounts.set(account.id, account);
    repository.transactions.push(...fixture.transactions);
    const original = fixture.transactions[0]!;
    const refund = fixture.transactions[1]!;
    repository.accounts.set(original.accountId, {
      ...repository.accounts.get(original.accountId)!,
      scope: { type: 'group', groupId: EXPERIENCE_OTHER_GROUP_ID },
    });
    const input = {
      id: experienceId(860),
      originalExpenseTransactionId: original.id,
      linkedAmountMinor: 2_500,
      refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
      confirmedPartialAllocations: true,
      expectedRefundVersion: refund.version,
      expectedOriginalVersion: original.version,
      expectedCreditCapacityVersion: 0,
      expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
    };
    expect(() =>
      putExpenseRefundRelationship(
        repository,
        fixture.actors.owner,
        refund.id,
        input,
        'hidden-original',
      ),
    ).toThrow(/not found/iu);
    expect(getExpenseRefundRelationship(repository, fixture.actors.owner, refund.id)).toBeUndefined();

    repository.accounts.set(original.accountId, fixture.accounts.find(({ id }) => id === original.accountId)!);
    const linked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      input,
      'visible-original',
    );
    expect(linked.relationship.originalExpenseTransactionId).toBe(original.id);

    repository.accounts.set(original.accountId, {
      ...repository.accounts.get(original.accountId)!,
      scope: { type: 'group', groupId: EXPERIENCE_OTHER_GROUP_ID },
    });
    expect(getExpenseRefundRelationship(repository, fixture.actors.owner, refund.id)).toBeUndefined();
  });
});
