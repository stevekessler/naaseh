import { FinancePublicationJournalReader } from '../../apps/api/src/finance/publication-journal-reader.js';
import {
  financePublicationJournalRecords,
  describeFinanceCanonicalChange,
} from '../../apps/api/src/finance/publication-change-journal.js';
import { describe, it, expect } from 'vitest';
import { FinancePublicationImpactReader } from '../../apps/api/src/finance/publication-impact-reader.js';
import {
  projectionDependencyKey,
  projectionDependencyFormat,
} from '../../apps/api/src/finance/projection-dependency-directory.js';
import { experienceId } from '../fixtures/finance/experience.js';
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';

const scope = 'FINANCE#SCOPE#OWNER#owner';
const accounts = [experienceId(100), experienceId(101)];
const entry = (accountId: string) => ({
  ...projectionDependencyKey(scope, accountId),
  format: projectionDependencyFormat,
  dependencyScope: scope,
  accountId,
});
function setup() {
  const calls: QueryCommandInput[] = [];
  let rows: Record<string, unknown>[] = accounts.map(entry);
  let next: Record<string, unknown> | undefined;
  const markers = new Map<
    string,
    { PK: string; SK: string; coverageDependencies: Record<string, number> }
  >(
    accounts.map((accountId) => [
      accountId,
      {
        PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`,
        SK: 'CURRENT',
        coverageDependencies: { [scope]: 1 },
      },
    ]),
  );
  const reader = new FinancePublicationImpactReader({
    query: async (input) => {
      calls.push(input);
      return { Items: rows, ...(next ? { LastEvaluatedKey: next } : {}) };
    },
    marker: async (accountId) => markers.get(accountId),
  });
  return {
    reader,
    calls,
    markers,
    rows(value: Record<string, unknown>[]) {
      rows = value;
    },
    next(value: Record<string, unknown> | undefined) {
      next = value;
    },
  };
}
describe('bounded private publication impact reads', () => {
  it('queries five strong directory candidates and filters stale entries against the current proof', async () => {
    const f = setup();
    f.markers.get(accounts[1]!)!.coverageDependencies = { 'FINANCE#CATALOG': 2 };
    const last = projectionDependencyKey(scope, accounts[1]!);
    f.next(last);
    expect(await f.reader.accounts(scope)).toEqual({ accountIds: [accounts[0]], nextKey: last });
    expect(f.calls[0]).toMatchObject({
      ConsistentRead: true,
      Limit: 5,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': last.PK, ':prefix': 'ACCOUNT#' },
    });
    expect(f.calls[0]).not.toHaveProperty('FilterExpression');
  });
  it('rejects unavailable, malformed and conflicting directory proofs without guessing that work is absent', async () => {
    const f = setup();
    f.markers.delete(accounts[0]!);
    await expect(f.reader.accounts(scope)).rejects.toThrow(/proof|coverage|unavailable/i);
    f.rows([{ ...entry(accounts[0]!), accountId: accounts[1] }]);
    await expect(f.reader.accounts(scope)).rejects.toThrow(/identity|directory/i);
    f.rows([{ ...entry(accounts[0]!), format: 'future-format' }]);
    await expect(f.reader.accounts(scope)).rejects.toThrow(/format|directory/i);
  });
  it('returns only source identities from the exact private reverse partition and rejects mismatched keys', async () => {
    const f = setup();
    const sourceId = experienceId(7000),
      transactionId = experienceId(8000),
      accountId = accounts[0]!;
    const PK = `FINANCE#FACT_DEPENDENCY#merchant#${sourceId}`;
    const row = {
      PK,
      SK: `ACCOUNT#${accountId}#TRANSACTION#${transactionId}`,
      accountId,
      transactionId,
    };
    f.rows([row]);
    expect(await f.reader.sources('merchant', sourceId)).toEqual({
      sources: [{ accountId, transactionId }],
    });
    expect(f.calls[0]?.ExpressionAttributeValues?.[':pk']).toBe(PK);
    f.rows([{ ...row, transactionId: experienceId(8001) }]);
    await expect(f.reader.sources('merchant', sourceId)).rejects.toThrow(/identity|reference/i);
  });
  it('isolates cursors by private partition and prefix before issuing a read', async () => {
    const f = setup();
    await expect(
      f.reader.accounts(scope, { PK: 'FINANCE#CATALOG', SK: 'ACCOUNT#x' }),
    ).rejects.toThrow(/cursor/i);
    await expect(
      f.reader.accounts(scope, {
        ...projectionDependencyKey(scope, accounts[0]!),
        SK: 'ROW#transactions#x',
      }),
    ).rejects.toThrow(/cursor/i);
    await expect(
      f.reader.sources(
        'merchant',
        experienceId(7000),
        projectionDependencyKey(scope, accounts[0]!),
      ),
    ).rejects.toThrow(/cursor/i);
    expect(f.calls).toHaveLength(0);
  });
  it('rejects oversized, unordered and non-progressing pages rather than skipping work', async () => {
    const f = setup();
    f.rows(Array.from({ length: 6 }, (_, index) => entry(experienceId(100 + index))));
    await expect(f.reader.accounts(scope)).rejects.toThrow(/bound|page/i);
    f.rows([...accounts].reverse().map(entry));
    await expect(f.reader.accounts(scope)).rejects.toThrow(/order|page/i);
    f.rows([]);
    f.next(projectionDependencyKey(scope, accounts[0]!));
    await expect(f.reader.accounts(scope)).rejects.toThrow(/progress|page/i);
    f.rows([entry(accounts[0]!)]);
    await expect(
      f.reader.accounts(scope, projectionDependencyKey(scope, accounts[0]!)),
    ).rejects.toThrow(/progress|order|page/i);
  });
  it('binds reverse-reference queries and cursors to one affected account when supplied', async () => {
    const f = setup(),
      sourceId = experienceId(7000),
      transactionId = experienceId(8000),
      accountId = accounts[0]!;
    const PK = `FINANCE#FACT_DEPENDENCY#merchant#${sourceId}`;
    const row = {
      PK,
      SK: `ACCOUNT#${accountId}#TRANSACTION#${transactionId}`,
      accountId,
      transactionId,
    };
    f.rows([row]);
    await f.reader.sources('merchant', sourceId, undefined, accountId);
    expect(f.calls[0]?.ExpressionAttributeValues?.[':prefix']).toBe(
      `ACCOUNT#${accountId}#TRANSACTION#`,
    );
    const count = f.calls.length;
    await expect(
      f.reader.sources(
        'merchant',
        sourceId,
        { PK, SK: `ACCOUNT#${accounts[1]}#TRANSACTION#${transactionId}` },
        accountId,
      ),
    ).rejects.toThrow(/cursor/i);
    expect(f.calls).toHaveLength(count);
  });
});

describe('bounded contiguous publication journal replay', () => {
  function journal(size = 7) {
    const rows = new Map<string, Record<string, unknown>>();
    const journals: Record<string, unknown>[] = [];
    const queries: QueryCommandInput[] = [];
    for (let revision = 1; revision <= size; revision++) {
      const id = experienceId(1000 + revision);
      const canonical = {
        PK: scope,
        SK: `ROW#transactions#${id}`,
        collection: 'transactions',
        entryKey: id,
        data: { id, accountId: accounts[0], version: 1 },
      };
      const records = financePublicationJournalRecords(
        [describeFinanceCanonicalChange(canonical, undefined, canonical)!],
        [{ PK: scope, beforeRevision: revision - 1, afterRevision: revision }],
      );
      rows.set(records[0]!.SK, records[0]!);
      journals.push(records[1]!);
    }
    const reader = new FinancePublicationJournalReader({
      query: async (input) => {
        queries.push(input);
        const values = input.ExpressionAttributeValues!;
        return {
          Items: journals.filter(
            (row) =>
              String(row.SK) >= String(values[':first']) &&
              String(row.SK) <= String(values[':last']),
          ),
        };
      },
      get: async (key) => rows.get(key.SK),
    });
    return { rows, journals, queries, reader };
  }
  it('replays at most five contiguous strong revisions and resumes from the exact returned revision', async () => {
    const f = journal();
    const first = await f.reader.range(scope, 0, 7);
    expect(first.entries).toHaveLength(5);
    expect(first.nextRevision).toBe(5);
    expect(f.queries[0]).toMatchObject({
      ConsistentRead: true,
      Limit: 5,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :first AND :last',
      ExpressionAttributeValues: {
        ':pk': scope,
        ':first': 'PUBLICATION_CHANGE#0000000000000001',
        ':last': 'PUBLICATION_CHANGE#0000000000000005',
      },
    });
    const second = await f.reader.range(scope, first.nextRevision!, 7);
    expect(second.entries).toHaveLength(2);
    expect(second).not.toHaveProperty('nextRevision');
  });
  it('fails closed on a missing or out-of-order revision without declaring the range complete', async () => {
    const f = journal();
    f.journals.splice(2, 1);
    await expect(f.reader.range(scope, 0, 7)).rejects.toThrow(/gap|contiguous|revision/i);
    const g = journal();
    g.journals.reverse();
    await expect(g.reader.range(scope, 0, 7)).rejects.toThrow(/order|revision|contiguous/i);
  });
  it('rejects journal rows with conflicting scope, transition, publication identity or format', async () => {
    for (const patch of [
      { PK: 'FINANCE#CATALOG' },
      { beforeRevision: 2 },
      { publicationId: 'bad' },
      { format: 'future' },
    ]) {
      const f = journal();
      Object.assign(f.journals[0]!, patch);
      await expect(f.reader.range(scope, 0, 7)).rejects.toThrow(
        /journal|revision|identity|format/i,
      );
    }
  });
  it('rejects missing manifests and altered content that no longer matches the publication digest', async () => {
    const f = journal();
    f.rows.clear();
    await expect(f.reader.range(scope, 0, 7)).rejects.toThrow(/manifest|publication/i);
    const g = journal();
    const first = g.rows.values().next().value!;
    (first.changes as Array<Record<string, unknown>>)[0]!.accountIds = [accounts[1]];
    await expect(g.reader.range(scope, 0, 7)).rejects.toThrow(/digest|identity|manifest/i);
  });
  it('validates ranges before storage and accepts reordered map properties with unchanged lists', async () => {
    const f = journal();
    for (const [start, end] of [
      [-1, 7],
      [0.5, 7],
      [8, 7],
      [0, Number.POSITIVE_INFINITY],
    ])
      await expect(f.reader.range(scope, start!, end!)).rejects.toThrow(/range|revision/i);
    await expect(f.reader.range('FINANCE#PUBLICATION_OUTBOX', 0, 7)).rejects.toThrow(
      /scope|range/i,
    );
    expect(f.queries).toHaveLength(0);
    expect(await f.reader.range(scope, 7, 7)).toEqual({ entries: [] });
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    for (const [key, row] of f.rows) f.rows.set(key, reorder(row) as Record<string, unknown>);
    expect((await f.reader.range(scope, 0, 7)).entries).toHaveLength(5);
  });
  it('loads a completed immutable manifest archive after its pending locator is removed', async () => {
    const f = journal(1),
      manifest = f.rows.values().next().value!;
    f.rows.clear();
    f.rows.set('CURRENT', {
      PK: `FINANCE#PUBLICATION_MANIFEST#${manifest.id}`,
      SK: 'CURRENT',
      publicationId: manifest.id,
      format: 'finance-publication-archive-v1',
      data: manifest,
    });
    expect((await f.reader.range(scope, 0, 1)).entries[0]?.id).toBe(manifest.id);
  });
});
