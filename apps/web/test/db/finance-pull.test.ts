import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  pending: new Map<string, { id: string; entityId: string; entityType: string }>(),
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    transaction: async (...args: unknown[]) => (args.at(-1) as () => Promise<void>)(),
    secureFinanceRecords: {
      delete: async (id: string) => state.records.delete(id),
      put: async (record: { id: string }) => state.records.set(record.id, record),
    },
    outbox: {
      toArray: async () => [...state.pending.values()],
      where: () => ({
        equals: (id: string) => ({
          delete: async () => {
            for (const [key, value] of state.pending)
              if (value.entityId === id) state.pending.delete(key);
          },
        }),
      }),
    },
  },
}));
import { applyFinancePull } from '../../src/db/finance-repository.js';
it('lets authoritative tombstones remove protected pending projections and dependent mutations', async () => {
  state.records.set('record', { id: 'record' });
  state.pending.set('mutation', {
    id: 'mutation',
    entityId: 'record',
    entityType: 'financeBudgetItem',
  });
  await applyFinancePull({
    records: [],
    tombstones: [{ id: 'record', entityType: 'financeBudgetItem' }],
  });
  expect(state.records.size).toBe(0);
  expect(state.pending.size).toBe(0);
});
