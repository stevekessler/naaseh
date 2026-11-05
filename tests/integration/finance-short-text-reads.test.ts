import { describe, expect, it } from 'vitest';
import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  FinanceReadRepository,
  type FinanceQueryClient,
} from '../../apps/api/src/finance/read-repository.js';
import {
  shortTextPostingKey,
  textOrdinalKey,
  updateTextPostingBit,
} from '../../apps/api/src/finance/text-postings.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

function setup(count: number, gram = 'ap', codec = 'short-text-v1') {
  const rows = new Map<string, Record<string, unknown>>();
  const identity = (key: { PK: unknown; SK: unknown }) => JSON.stringify([key.PK, key.SK]);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const effectiveAt = new Date(Date.UTC(2026, 9, 1) + (count - ordinal) * 1_000).toISOString();
    const fact: FinanceFact = {
      id: `t${ordinal}`,
      accountId: 'a1',
      description: 'Apple',
      effectiveAt,
      amountMinor: -100,
      currency: 'USD',
      currencyExponent: 2,
      sourceVersion: 1,
      textMonth: '2026-10',
      textOrdinal: ordinal,
      slices: [
        {
          transactionId: `t${ordinal}`,
          accountId: 'a1',
          effectiveAt,
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: 100,
        },
      ],
    };
    const key =
      gram.length <= 2
        ? shortTextPostingKey('a1', gram, '2026-10', ordinal)
        : {
            PK: `FINANCE#FACT_SEARCH#a1#text#${gram}`,
            SK: `DATE#2026-10#${String(Math.floor(ordinal / 500)).padStart(12, '0')}`,
          };
    const previous = rows.get(identity(key));
    rows.set(identity(key), {
      ...key,
      codec,
      month: '2026-10',
      baseOrdinal: Math.floor(ordinal / 500) * 500,
      bits: updateTextPostingBit(
        (previous?.bits as Uint8Array) ?? new Uint8Array(63),
        ordinal,
        true,
      ),
    });
    const dictionary = textOrdinalKey('a1', '2026-10', ordinal);
    rows.set(identity(dictionary), { ...dictionary, fact });
  }
  const commands: Array<QueryCommand | BatchGetCommand> = [];
  const client: FinanceQueryClient = {
    send: async (command) => {
      commands.push(command);
      if (command instanceof QueryCommand) {
        const values = command.input.ExpressionAttributeValues!;
        let matches = [...rows.values()]
          .filter((row) => row.PK === values[':pk'] && String(row.SK).startsWith('DATE#'))
          .sort((a, b) => String(b.SK).localeCompare(String(a.SK)));
        if (values[':last'])
          matches = matches.filter((row) => String(row.SK) <= String(values[':last']));
        if (command.input.ExclusiveStartKey)
          matches = matches.filter(
            (row) => String(row.SK) < String(command.input.ExclusiveStartKey!.SK),
          );
        const page = matches.slice(0, command.input.Limit);
        return {
          Items: page,
          ScannedCount: page.length,
          ...(matches.length > page.length
            ? {
                LastEvaluatedKey: { PK: page.at(-1)!.PK, SK: page.at(-1)!.SK },
              }
            : {}),
        } as Awaited<ReturnType<FinanceQueryClient['send']>>;
      }
      const keys = command.input.RequestItems!.table!.Keys!;
      return {
        Responses: {
          table: keys
            .map((key) => rows.get(identity(key as { PK: unknown; SK: unknown })))
            .filter(Boolean),
        },
      } as Awaited<ReturnType<FinanceQueryClient['send']>>;
    },
  };
  return {
    rows,
    identity,
    commands,
    repository: new FinanceReadRepository({
      tableName: 'table',
      cursorSecret: 's'.repeat(32),
      client,
      authorize: async () => true,
    }),
  };
}
const input = {
  userId: 'u1',
  accountId: 'a1',
  sourceRevision: 'r1',
  securityRevision: 1,
  filters: { text: 'AP' },
  limit: 50,
};

describe('bounded compact short-text reads', () => {
  it('resumes inside a posting chunk without skipping or repeating matching transactions', async () => {
    const f = setup(600);
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const result = await f.repository.read({ ...input, cursor });
      ids.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (ids.length > 600) throw new Error('Repeated page');
    } while (cursor);
    expect(new Set(ids).size).toBe(600);
    expect(ids).toHaveLength(600);
  });

  it('limits each scan to 1,000 actual facts and computes all totals independently of displayed rows', async () => {
    const f = setup(1_001);
    let cursor: string | undefined;
    let total = 0;
    let amount = 0;
    do {
      const result = await f.repository.scan({ ...input, cursor });
      expect(result.step.examined).toBeLessThanOrEqual(1_000);
      total += result.step.matchedCount;
      amount += result.step.totalsByCurrency[0]?.amountMinor ?? 0;
      cursor = result.step.nextCursor;
    } while (cursor);
    expect(total).toBe(1_001);
    expect(amount).toBe(100_100);
    for (const command of f.commands.filter((c) => c instanceof QueryCommand))
      expect(command.input.Limit).toBe(2);
  });

  it('returns the globally newest candidate rows for automatic jobs and fails closed on missing ordinal facts', async () => {
    const f = setup(600);
    const result = await f.repository.scan(input);
    expect(result.step.topRows[0]!.id).toBe('t0');
    const bad = setup(10);
    bad.rows.delete(bad.identity(textOrdinalKey('a1', '2026-10', 0)));
    await expect(bad.repository.read(input)).rejects.toThrow(/incomplete|rebuild/i);
  });

  it('reads three-character bitmaps for long normalized text without hydrating the account', async () => {
    const f = setup(600, 'app', 'text-bitmap-v2');
    const result = await f.repository.scan({ ...input, filters: { text: 'ＡＰＰＬＥ' } });
    expect(result.page.rowsState).toBe('ready');
    expect(result.step.matchedCount).toBe(600);
    expect(result.step.totalsByCurrency[0]?.amountMinor).toBe(60_000);
    expect((f.commands[0] as QueryCommand).input.Limit).toBe(2);
    expect(result.step.examined).toBe(600);
  });

  it('applies the full substring predicate after a compact three-character candidate probe', async () => {
    const f = setup(10, 'app', 'text-bitmap-v2');
    const result = await f.repository.read({ ...input, filters: { text: 'apple pie' } });
    expect(result).toMatchObject({
      rowsState: 'confirmed-empty',
      totalCount: 0,
      aggregateState: 'exact',
    });
  });

  it('rejects an unmigrated long-text reference instead of falsely confirming an empty bitmap', async () => {
    const f = setup(0);
    f.rows.set('legacy', {
      PK: 'FINANCE#FACT_SEARCH#a1#text#app',
      SK: 'DATE#2026-10-01T00:00:00.000Z#t0',
      transactionId: 't0',
    });
    await expect(f.repository.read({ ...input, filters: { text: 'apple' } })).rejects.toThrow(
      /rebuild|posting/i,
    );
  });
});
