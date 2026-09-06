import { describe, expect, it } from 'vitest';
import { CrisisPlanService } from '../../apps/api/src/journal/crisis-plan-service.js';
import { InMemoryCrisisPlanRepository } from '../../apps/api/src/journal/crisis-plan-repository.js';
import {
  crisisPlanCiphertextFixture,
  crisisPlanGrantFixture,
  crisisPlanOwnerWrapFixture,
  crisisPlanRecordFixture,
} from '../fixtures/crisis-plan.js';

describe('Crisis Plan selective sharing', () => {
  it('finds active users, activates access immediately, blocks duplicates, and self-removal requires rotation', async () => {
    const repository = new InMemoryCrisisPlanRepository();
    const users = [
      { id: 'owner-1', displayName: 'Owner', username: 'owner', active: true },
      { id: 'recipient-1', displayName: 'Trusted User', username: 'trusted', active: true },
      { id: 'inactive', displayName: 'Inactive', username: 'inactive', active: false },
    ];
    const service = new CrisisPlanService(repository, () => '2026-08-29T12:00:00.000Z', users);
    await service.create('owner-1', {
      mutationId: crypto.randomUUID(),
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    });
    expect(service.searchUsers('owner-1', 'tr').users).toEqual([
      { id: 'recipient-1', displayName: 'Trusted User', username: 'trusted' },
    ]);
    const share = await service.share('owner-1', 'recipient-1', crisisPlanGrantFixture());
    expect(share.state).toBe('active');
    expect(await service.share('owner-1', 'recipient-1', crisisPlanGrantFixture())).toEqual(share);
    expect(await service.listShared('recipient-1')).toHaveLength(1);
    await service.removeAccess('recipient-1', 'owner-1');
    expect((await service.read('owner-1')).rotationState).toBe('rotation_required');
    await expect(
      service.replace('owner-1', {
        mutationId: crypto.randomUUID(),
        baseVersion: 1,
        keyGeneration: 1,
        body: crisisPlanCiphertextFixture(),
        ownerWrap: crisisPlanOwnerWrapFixture(),
      }),
    ).rejects.toThrow('Rotate');
  });

  it('enforces the 90-recipient transaction ceiling', async () => {
    const users = Array.from({ length: 91 }, (_, index) => ({
      id: `recipient-${index}`,
      displayName: `Recipient ${index}`,
      username: `r${index}`,
      active: true,
    }));
    const service = new CrisisPlanService(new InMemoryCrisisPlanRepository(), undefined, users);
    await service.create('owner-1', {
      mutationId: crypto.randomUUID(),
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    });
    for (let index = 0; index < 90; index++)
      await service.share(
        'owner-1',
        `recipient-${index}`,
        crisisPlanGrantFixture({ recipientId: `recipient-${index}` }),
      );
    await expect(
      service.share(
        'owner-1',
        'recipient-90',
        crisisPlanGrantFixture({ recipientId: 'recipient-90' }),
      ),
    ).rejects.toThrow('at most 90');
  });

  it('revokes cryptographically by rotating the body, owner wrap, and every remaining grant atomically', async () => {
    const repository = new InMemoryCrisisPlanRepository();
    const users = ['recipient-1', 'recipient-2'].map((id) => ({
      id,
      displayName: id,
      username: id,
      active: true,
    }));
    const service = new CrisisPlanService(repository, () => '2026-08-29T12:00:00.000Z', users);
    await service.create('owner-1', {
      mutationId: crypto.randomUUID(),
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    });
    await service.share(
      'owner-1',
      'recipient-1',
      crisisPlanGrantFixture({ recipientId: 'recipient-1' }),
    );
    await service.share(
      'owner-1',
      'recipient-2',
      crisisPlanGrantFixture({ recipientId: 'recipient-2' }),
    );
    const result = await service.rotateAccess(
      'owner-1',
      {
        mutationId: crypto.randomUUID(),
        baseVersion: 1,
        keyGeneration: 2,
        body: crisisPlanCiphertextFixture({ keyGeneration: 2 }),
        ownerWrap: crisisPlanOwnerWrapFixture({ keyGeneration: 2 }),
        grants: [
          {
            recipientId: 'recipient-2',
            grant: crisisPlanGrantFixture({
              recipientId: 'recipient-2',
              shareVersion: 2,
              keyGeneration: 2,
            }),
          },
        ],
      },
      'recipient-1',
    );
    expect(result.plan).toMatchObject({ version: 2, keyGeneration: 2, rotationState: 'current' });
    expect(repository.readShare('owner-1', 'recipient-1')).toMatchObject({
      state: 'revoked',
      grant: undefined,
    });
    expect(repository.readShare('owner-1', 'recipient-2')).toMatchObject({
      state: 'active',
      version: 2,
      grant: { keyGeneration: 2 },
    });
    expect(await service.listShared('recipient-1')).toEqual([]);
  });
});
