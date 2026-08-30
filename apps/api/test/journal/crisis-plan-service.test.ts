import { describe, expect, it } from 'vitest';
import { InMemoryCrisisPlanRepository } from '../../src/journal/crisis-plan-repository.js';
import { CrisisPlanService } from '../../src/journal/crisis-plan-service.js';
import {
  crisisPlanCiphertextFixture,
  crisisPlanOwnerWrapFixture,
  crisisPlanRecordFixture,
} from '../../../../tests/fixtures/crisis-plan.js';

const create = (mutationId = crypto.randomUUID()) => ({
  mutationId,
  planId: crisisPlanRecordFixture().planId,
  baseVersion: 0 as const,
  keyGeneration: 1 as const,
  body: crisisPlanCiphertextFixture(),
  ownerWrap: crisisPlanOwnerWrapFixture(),
});
describe('Crisis Plan owner service', () => {
  it('creates one ciphertext plan idempotently and gates journal creation', async () => {
    const repository = new InMemoryCrisisPlanRepository();
    const service = new CrisisPlanService(repository, () => '2026-08-29T12:00:00.000Z');
    await expect(service.assertJournalCreation('owner-1', 0)).rejects.toThrow('before your first');
    const input = create();
    expect(await service.create('owner-1', input)).toMatchObject({
      ownerId: 'owner-1',
      version: 1,
    });
    expect(await service.create('owner-1', input)).toMatchObject({ version: 1 });
    await expect(service.create('owner-1', create())).rejects.toThrow('already exists');
    await expect(service.assertJournalCreation('owner-1', 0)).resolves.toBeUndefined();
  });

  it('replaces by exact version, preserves identity, and denies cross-owner reads', async () => {
    const service = new CrisisPlanService(new InMemoryCrisisPlanRepository());
    const first = await service.create('owner-1', create());
    const replaced = await service.replace('owner-1', {
      mutationId: crypto.randomUUID(),
      baseVersion: 1,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture({ ciphertext: 'Z'.repeat(32) }),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    });
    expect(replaced).toMatchObject({ planId: first.planId, version: 2 });
    await expect(
      service.replace('owner-1', {
        mutationId: crypto.randomUUID(),
        baseVersion: 1,
        keyGeneration: 1,
        body: crisisPlanCiphertextFixture(),
        ownerWrap: crisisPlanOwnerWrapFixture(),
      }),
    ).rejects.toThrow('another device');
    await expect(service.read('owner-1', 'other')).rejects.toThrow('unavailable');
  });
});
