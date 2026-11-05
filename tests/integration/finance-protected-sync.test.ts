import { describe, expect, it } from 'vitest';
import {
  createFinanceSyncHandler,
  pullFinanceDeliveryLanes,
} from '../../apps/api/src/sync/handlers.js';

const changes = [
  {
    sequence: 1,
    entityId: 'task-one',
    entityType: 'task',
    operation: 'upsert',
    payload: { label: 'Ordinary task' },
  },
  {
    sequence: 2,
    entityId: 'private-one',
    entityType: 'financeTransaction',
    operation: 'upsert',
    payload: { amountMinor: 100 },
  },
  {
    sequence: 3,
    entityId: 'task-two',
    entityType: 'task',
    operation: 'upsert',
    payload: { label: 'Ordinary task two' },
  },
] as any[];
const read = async (_audience: string, after: number) => changes.filter((c) => c.sequence > after);
const feeds: [string, string][] = [['owner', 'OWNER#u1']];
describe('independent protected Finance synchronization delivery', () => {
  it('advances ordinary tasks while locked without acknowledging hidden Finance changes', async () => {
    const result = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      financeCursor: {},
      contractVersion: 8,
      requirePin: true,
      unlocked: false,
      read,
    });
    expect(result.changes.map((c) => c.entityId)).toEqual(['task-one', 'task-two']);
    expect(result.cursor).toEqual({ owner: 3 });
    expect(result.financeCursor).toEqual({});
    expect(result.financeChanges).toEqual([]);
    expect(result.financeState).toBe('locked');
  });
  it('replays protected changes from their own checkpoint after ordinary sync already advanced', async () => {
    const result = await pullFinanceDeliveryLanes({
      feeds,
      cursor: { owner: 3 },
      financeCursor: {},
      contractVersion: 8,
      requirePin: true,
      unlocked: true,
      read,
    });
    expect(result.changes).toEqual([]);
    expect(result.financeChanges.map((c) => c.entityId)).toEqual(['private-one']);
    expect(result.financeCursor).toEqual({ owner: 3 });
    expect(result.financeState).toBe('ready');
  });
  it('preserves legacy unprotected delivery but withholds protected Finance from older clients', async () => {
    const modernRead = async (audience: string, after: number) =>
      [
        ...(await read(audience, after)),
        {
          sequence: 4,
          entityId: 'refund-v2',
          entityType: 'financeRefundRelationship',
          operation: 'upsert',
          payload: { privateReference: 'v2-only' },
        },
      ].filter((change) => change.sequence > after) as any[];
    const legacy = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      contractVersion: 7,
      requirePin: false,
      unlocked: false,
      read: modernRead,
    });
    expect(legacy.changes).toHaveLength(3);
    expect(JSON.stringify(legacy.changes)).not.toContain('v2-only');
    const modern = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      financeCursor: {},
      contractVersion: 8,
      requirePin: false,
      unlocked: false,
      read: modernRead,
    });
    expect(modern.financeChanges.map((row) => row.entityId)).toContain('refund-v2');
    const protectedLegacy = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      contractVersion: 7,
      requirePin: true,
      unlocked: true,
      read,
    });
    expect(protectedLegacy.changes.map((c) => c.entityId)).toEqual(['task-one', 'task-two']);
    expect(protectedLegacy.financeState).toBe('upgrade-required');
    expect(protectedLegacy.financeCursor).toEqual({});
    let allowed = false;
    let dispatched = 0;
    const replay = createFinanceSyncHandler(
      async () => {
        dispatched++;
        allowed = false; // Protection changed during dispatch/receipt lookup.
        return {
          mutationId: 'm1',
          status: 'alreadyApplied',
          entity: { amountMinor: 100 },
        } as never;
      },
      async () => {
        if (!allowed) throw new Error('Unlock Finance');
      },
    );
    const mutation = { entityType: 'financeTransaction' } as never;
    await expect(replay('u1', mutation)).rejects.toThrow(/unlock/i);
    expect(dispatched).toBe(0);
    allowed = true;
    await expect(replay('u1', mutation)).rejects.toThrow(/unlock/i);
    expect(dispatched).toBe(1);
  });
});
