import { describe, expect, it, vi } from 'vitest';
import { CrisisPlanService } from '../../apps/api/src/journal/crisis-plan-service.js';
import { InMemoryCrisisPlanRepository } from '../../apps/api/src/journal/crisis-plan-repository.js';
import {
  crisisPlanCiphertextFixture,
  crisisPlanOwnerWrapFixture,
  crisisPlanRecordFixture,
} from '../fixtures/crisis-plan.js';
import { drainJournalDataInDependencyOrder } from '../../apps/web/src/sync/crisis-plan-sync.js';
import { applyCrisisPlanSyncMutation } from '../../apps/api/src/journal/crisis-plan-handler.js';

describe('Crisis Plan prerequisite and synchronization ordering', () => {
  it('replays creation idempotently and rejects entry creation until the same owner has a plan', async () => {
    const repository = new InMemoryCrisisPlanRepository();
    const service = new CrisisPlanService(repository);
    const input = {
      mutationId: crypto.randomUUID(),
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0 as const,
      keyGeneration: 1 as const,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    };
    await expect(service.assertJournalCreation('owner-1', 0)).rejects.toThrow();
    const first = await service.create('owner-1', input);
    expect(await service.create('owner-1', input)).toEqual(first);
    await expect(service.assertJournalCreation('owner-1', 0)).resolves.toBeUndefined();
    await expect(service.assertJournalCreation('other', 0)).rejects.toThrow();
  });
  it('acknowledges the plan before attempting the dependent first journal entry', async () => {
    const order: string[] = [];
    const plan = vi.fn(async () => {
      order.push('plan');
    });
    const journal = vi.fn(async () => {
      order.push('journal');
    });
    await drainJournalDataInDependencyOrder('owner', 'csrf', journal, plan);
    expect(order).toEqual(['plan', 'journal']);
  });
  it('dispatches sync-v6 owner mutations idempotently and reports stale encrypted versions as conflicts', async () => {
    const planId = crypto.randomUUID() as import('@naaseh/domain').CrisisPlanRecord['planId'];
    const created = {
      id: crypto.randomUUID(),
      entityType: 'crisisPlan' as const,
      operation: 'create' as const,
      planId,
      baseVersion: 0,
      payload: {
        planId,
        version: 1,
        keyGeneration: 1,
        rotationState: 'current' as const,
        body: crisisPlanCiphertextFixture(),
        ownerWrap: crisisPlanOwnerWrapFixture(),
      },
      createdAt: new Date().toISOString(),
    };
    const service = new CrisisPlanService(new InMemoryCrisisPlanRepository());
    expect(await applyCrisisPlanSyncMutation('sync-owner', created, service)).toMatchObject({
      status: 'applied',
      version: 1,
    });
    expect(await applyCrisisPlanSyncMutation('sync-owner', created, service)).toMatchObject({
      status: 'applied',
      version: 1,
    });
    const replaced = {
      ...created,
      id: crypto.randomUUID(),
      operation: 'replace' as const,
      baseVersion: 1,
      payload: { ...created.payload, version: 2 },
    };
    expect(await applyCrisisPlanSyncMutation('sync-owner', replaced, service)).toMatchObject({
      status: 'applied',
      version: 2,
    });
    const stale = { ...replaced, id: crypto.randomUUID() };
    expect(await applyCrisisPlanSyncMutation('sync-owner', stale, service)).toMatchObject({
      status: 'conflict',
      currentVersion: 2,
    });
  });
});
