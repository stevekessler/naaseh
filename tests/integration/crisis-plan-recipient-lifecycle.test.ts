import { describe, expect, it } from 'vitest';
import { CrisisPlanService } from '../../apps/api/src/journal/crisis-plan-service.js';
import { InMemoryCrisisPlanRepository } from '../../apps/api/src/journal/crisis-plan-repository.js';
import {
  crisisPlanCiphertextFixture,
  crisisPlanGrantFixture,
  crisisPlanOwnerWrapFixture,
  crisisPlanRecordFixture,
} from '../fixtures/crisis-plan.js';

describe('shared Crisis Plan recipient lifecycle', () => {
  it('denies a deactivated recipient without changing the owner plan or other shares', async () => {
    const repository = new InMemoryCrisisPlanRepository();
    const users = [
      { id: 'recipient-1', displayName: 'Recipient', username: 'recipient', active: true },
      { id: 'recipient-2', displayName: 'Other', username: 'other', active: true },
    ];
    const service = new CrisisPlanService(repository, undefined, users);
    await service.create('owner-1', {
      mutationId: crypto.randomUUID(),
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    });
    await service.share('owner-1', 'recipient-1', crisisPlanGrantFixture());
    await service.share(
      'owner-1',
      'recipient-2',
      crisisPlanGrantFixture({ recipientId: 'recipient-2' }),
    );
    users[0]!.active = false;
    expect(await service.listShared('recipient-1')).toEqual([]);
    expect(await service.listShared('recipient-2')).toHaveLength(1);
    expect((await service.read('owner-1')).version).toBe(1);
  });
});
