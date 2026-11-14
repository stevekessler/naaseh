import { describe, expect, it, vi } from 'vitest';
import { readFinanceBootstrapPage } from '../../src/finance/bootstrap.js';

const secret = 'finance-bootstrap-test-secret-is-long-enough';
const owner = 'owner';
const catalog = 'FINANCE#CATALOG';
const ownerScope = 'FINANCE#SCOPE#OWNER#owner';
const groupScope = 'FINANCE#SCOPE#GROUP#group-1';

function fixture() {
  const revisions = new Map([
    [catalog, 2],
    [ownerScope, 3],
    [groupScope, 4],
  ]);
  const pages = new Map<string, Array<Array<Record<string, unknown>>>>([
    [
      catalog,
      [
        [
          {
            PK: catalog,
            SK: 'ROW#categories#a',
            collection: 'categories',
            entryKey: 'category-1',
          },
        ],
        [
          {
            PK: catalog,
            SK: 'ROW#merchants#b',
            collection: 'merchants',
            entryKey: 'merchant-1',
          },
        ],
      ],
    ],
    [
      ownerScope,
      [
        [
          {
            PK: ownerScope,
            SK: 'ROW#accounts#a',
            collection: 'accounts',
            entryKey: 'account-1',
          },
        ],
      ],
    ],
    [
      groupScope,
      [
        [
          {
            PK: groupScope,
            SK: 'ROW#budgets#a',
            collection: 'budgets',
            entryKey: 'budget-1',
          },
          {
            PK: groupScope,
            SK: 'ROW#locks#z',
            collection: 'categoryNameLocks',
            entryKey: 'private-lock',
          },
        ],
      ],
    ],
  ]);
  const calls = new Map<string, number>();
  const values: Record<string, Record<string, unknown>> = {
    'category-1': { id: 'category-1', version: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
    'merchant-1': { id: 'merchant-1', version: 2 },
    'account-1': { id: 'account-1', version: 3 },
    'budget-1': { id: 'budget-1', version: 4 },
  };
  const guard = {
    readCanonicalSource: vi.fn(async (_type: string, id: string) => values[id]),
    assertCurrent: vi.fn(async () => undefined),
  };
  return {
    revisions,
    guard,
    dependencies: {
      revision: vi.fn(async (partition: string) => revisions.get(partition) ?? 0),
      frontier: vi.fn(async () => ({ public: 7, owner: 11, 'group:group-1': 13 })),
      page: vi.fn(async (partition: string) => {
        const index = calls.get(partition) ?? 0;
        calls.set(partition, index + 1);
        const source = pages.get(partition) ?? [];
        return {
          rows: source[index] ?? [],
          ...(index + 1 < source.length
            ? { cursor: { PK: partition, SK: String(source[index]!.at(-1)!.SK) } }
            : {}),
        };
      }),
      guard,
      now: () => Date.parse('2026-01-02T00:00:00.000Z'),
    },
  };
}

async function allPages(input: ReturnType<typeof fixture>) {
  const results = [];
  let cursor: string | undefined;
  do {
    const page = await readFinanceBootstrapPage({
      userId: owner,
      partitions: [catalog, ownerScope, groupScope],
      secret,
      dependencies: input.dependencies,
      ...(cursor ? { cursor } : {}),
    });
    results.push(page);
    cursor = page.nextCursor;
  } while (cursor);
  return results;
}

describe('Finance current-state bootstrap', () => {
  it('pages authorized canonical partitions and carries one captured feed frontier', async () => {
    const input = fixture();
    const pages = await allPages(input);

    expect(pages).toHaveLength(4);
    expect(pages.flatMap((page) => page.records.map((record) => record.entityId))).toEqual([
      'category-1',
      'merchant-1',
      'account-1',
      'budget-1',
    ]);
    expect(
      pages.every((page) => JSON.stringify(page.frontier) === JSON.stringify(pages[0]!.frontier)),
    ).toBe(true);
    expect(pages.at(-1)).toMatchObject({ complete: true, frontier: { owner: 11 } });
    expect(input.dependencies.frontier).toHaveBeenCalledTimes(1);
    expect(input.guard.readCanonicalSource).not.toHaveBeenCalledWith(
      expect.anything(),
      'private-lock',
    );
  });

  it('rejects a continuation after membership-derived partitions change', async () => {
    const input = fixture();
    const first = await readFinanceBootstrapPage({
      userId: owner,
      partitions: [catalog, ownerScope, groupScope],
      secret,
      dependencies: input.dependencies,
    });
    await expect(
      readFinanceBootstrapPage({
        userId: owner,
        partitions: [catalog, ownerScope],
        cursor: first.nextCursor,
        secret,
        dependencies: input.dependencies,
      }),
    ).rejects.toThrow(/access changed/i);
  });

  it('rejects a page when any canonical scope revision changes', async () => {
    const input = fixture();
    const first = await readFinanceBootstrapPage({
      userId: owner,
      partitions: [catalog, ownerScope, groupScope],
      secret,
      dependencies: input.dependencies,
    });
    input.revisions.set(ownerScope, 4);
    await expect(
      readFinanceBootstrapPage({
        userId: owner,
        partitions: [catalog, ownerScope, groupScope],
        cursor: first.nextCursor,
        secret,
        dependencies: input.dependencies,
      }),
    ).rejects.toThrow(/changed during bootstrap/i);
  });

  it('binds encrypted continuations to the user and detects tampering', async () => {
    const input = fixture();
    const first = await readFinanceBootstrapPage({
      userId: owner,
      partitions: [catalog, ownerScope, groupScope],
      secret,
      dependencies: input.dependencies,
    });
    await expect(
      readFinanceBootstrapPage({
        userId: 'other',
        partitions: [catalog, 'FINANCE#SCOPE#OWNER#other'],
        cursor: first.nextCursor,
        secret,
        dependencies: input.dependencies,
      }),
    ).rejects.toThrow(/invalid or expired/i);
    await expect(
      readFinanceBootstrapPage({
        userId: owner,
        partitions: [catalog, ownerScope, groupScope],
        cursor: `${first.nextCursor}x`,
        secret,
        dependencies: input.dependencies,
      }),
    ).rejects.toThrow(/invalid or expired/i);
  });
});
