import { describe, expect, it } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';

describe('Finance indexed adapter sparse/zero-match feasibility', () => {
  it('returns verified empty and sparse matches without traversing a 100k scope', async () => {
    // A command double models indexed partition access, not mobile/AWS latency.
    const unrelated = new Map(Array.from({ length: 100_000 }, (_, i) => [`unrelated-${i}`, i]));
    const calls: QueryCommand[] = [];
    const repository = new FinanceReadRepository({
      tableName: 'table',
      cursorSecret: 'p'.repeat(32),
      authorize: async () => true,
      client: {
        send: async (command: QueryCommand) => {
          calls.push(command);
          expect(command.input.ExpressionAttributeValues?.[':pk']).toContain('#check#');
          const hit =
            command.input.ExpressionAttributeValues?.[':pk'] === 'FINANCE#FACT_SEARCH#a1#check#001';
          return {
            ScannedCount: hit ? 1 : 0,
            Items: hit
              ? [
                  {
                    fact: {
                      id: 'match',
                      accountId: 'a1',
                      effectiveAt: '2026-10-01T00:00:00Z',
                      currency: 'USD',
                      currencyExponent: 2,
                      amountMinor: -100,
                      checkNumber: '001',
                      description: 'Synthetic',
                      sourceVersion: 1,
                      slices: [],
                    },
                  },
                ]
              : [],
          };
        },
      },
    });
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      const result = await repository.read({
        userId: 'u1',
        accountId: 'a1',
        sourceRevision: 'r1',
        securityRevision: 1,
        filters: { checkNumber: i % 2 ? '001' : 'absent' },
      });
      expect(result.rowsState).toBe(i % 2 ? 'ready' : 'confirmed-empty');
      expect(result.coverage.examined).toBeLessThanOrEqual(1);
    }
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(calls).toHaveLength(20);
    expect(unrelated.size).toBe(100_000);
  });
});
