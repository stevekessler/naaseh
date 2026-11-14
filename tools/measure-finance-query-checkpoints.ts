/** Offline synthetic command sizing only. No AWS client is invoked; authority,
 * condition-check reads, retries, and compute costs are excluded. JSON bytes +100/item
 * estimates representation size, not DynamoDB ConsumedCapacity or live latency.
 * Bundle with esbuild for Node/CJS, then execute locally. */
import { FinanceReadRepository } from '../apps/api/src/finance/read-repository.js';
import {
  DynamoFinanceQueryJobStore,
  FinanceQueryJobService,
} from '../apps/api/src/finance/query-job-service.js';
import { FinanceUnitOfWork } from '../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../tests/fixtures/finance/persistence.js';
import { createFinanceAccountReadSummary } from '../apps/api/src/finance/account-read-summary.js';
import { compareFinanceRows } from '../apps/api/src/finance/query-contract.js';
const bytes = (item: unknown) => Buffer.byteLength(JSON.stringify(item)) + 100;
async function scenario(accounts: number, each: number, compact = true) {
  const fixture = financePersistenceFixture();
  let writeUnits = 0,
    gets = 0,
    queries = 0,
    candidates = 0,
    maxItemBytes = 0,
    batchGets = 0,
    factReadUnits = 0,
    indexReadUnits = 0,
    hydrationReads = 0,
    hydrationReadUnits = 0;
  const persistence = {
    get: async (key: any) => {
      gets++;
      return fixture.persistence.get(key);
    },
    write: async (items: any[]) => {
      for (const entry of items)
        if (entry.Put) {
          const old = fixture.rows.get(fixture.key(entry.Put.Item));
          const size = Math.max(bytes(old ?? {}), bytes(entry.Put.Item));
          maxItemBytes = Math.max(maxItemBytes, size);
          writeUnits += 2 * Math.ceil(size / 1024);
        }
      return fixture.persistence.write(items);
    },
  };
  const ids = Array.from({ length: accounts }, (_, a) => `01K7Q0Y${String(a).padStart(19, '0')}`);
  const facts = new Map(
    ids.map((accountId, a) => [
      accountId,
      Array.from({ length: each }, (_, n) => {
        const id = `01K7T${String(a * each + n).padStart(21, '0')}`;
        const effectiveAt = new Date(Date.UTC(2026, 9, 31) - n * 86_400_000).toISOString();
        return {
          id,
          accountId,
          effectiveAt,
          description: 'Synthetic only',
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: -100,
          sourceVersion: 1,
          slices: [
            {
              transactionId: id,
              accountId,
              effectiveAt,
              currency: 'USD',
              currencyExponent: 2,
              amountMinor: 100,
            },
          ],
        };
      }),
    ]),
  );
  const byId = new Map([...facts.values()].flat().map((fact) => [fact.id, fact]));
  const repository = new FinanceReadRepository({
    tableName: 'synthetic',
    cursorSecret: 's'.repeat(32),
    authorize: async () => true,
    client: {
      send: async (command: any) => {
        const input = command.input;
        if (input.RequestItems) {
          batchGets++;
          const Items = input.RequestItems.synthetic.Keys.map((key: any) => ({
            ...key,
            fact: byId.get(key.PK.split('#').at(-1))!,
          }));
          factReadUnits += Items.reduce(
            (n: number, row: any) => n + Math.ceil(bytes(row) / 4096),
            0,
          );
          return { Responses: { synthetic: Items } };
        }
        if (!input.KeyConditionExpression) throw new Error('Unexpected non-query');
        queries++;
        const pk = input.ExpressionAttributeValues[':pk'];
        const accountId = pk.split('#').at(-1);
        const rows = facts
          .get(accountId)!
          .map((fact) => ({ PK: pk, SK: `DATE#${fact.effectiveAt}#${fact.id}`, fact }))
          .sort((a, b) => (a.SK < b.SK ? 1 : -1));
        const start = input.ExclusiveStartKey?.SK;
        const upper = input.ExpressionAttributeValues[':last'];
        const lower = input.ExpressionAttributeValues[':prefix'];
        const eligible = rows.filter(
          (r) => (!start || r.SK < start) && (!upper || r.SK <= upper) && r.SK >= lower,
        );
        const page = eligible.slice(0, input.Limit);
        candidates += page.length;
        const references = page.map((row) => ({
          PK: row.PK,
          SK: row.SK,
          transactionId: row.fact.id,
          ...(compact ? { aggregate: createFinanceAccountReadSummary(row.fact) } : {}),
        }));
        indexReadUnits += Math.max(
          1,
          Math.ceil(references.reduce((n, row) => n + bytes(row), 0) / 4096),
        );
        return {
          Items: references,
          ScannedCount: page.length,
          ...(eligible.length > page.length
            ? { LastEvaluatedKey: { PK: pk, SK: page.at(-1)!.SK } }
            : {}),
        };
      },
    },
  });
  const queue: any[] = [];
  const store = new DynamoFinanceQueryJobStore(
    () => new FinanceUnitOfWork(persistence, 'synthetic'),
  );
  const service = new FinanceQueryJobService({
    repository,
    store,
    cursorSecret: 'p'.repeat(32),
    validate: async () => true,
    authorizeFacts: async () => true,
    authorizeDelivery: async () => true,
    ...(compact
      ? {
          preview: async (job) => {
            const results: Array<Awaited<ReturnType<FinanceReadRepository['preview']>>> = [];
            for (let offset = 0; offset < job.partitions.length; offset += 5)
              results.push(
                ...(await Promise.all(
                  job.partitions
                    .slice(offset, offset + 5)
                    .map((partition) =>
                      repository.preview({
                        userId: job.userId,
                        accountId: partition.accountId,
                        sourceRevision: job.sourceRevisions[partition.accountId]!,
                        securityRevision: job.securityRevision,
                        filters: job.filters,
                      }),
                    ),
                )),
              );
            if (results.some((result) => result.nextCursor && result.topRows.length < 200))
              return undefined;
            return {
              firstIds: results
                .flatMap((result) => result.topRows)
                .sort(compareFinanceRows)
                .slice(0, 200),
              examined: results.reduce((n, result) => n + result.examined, 0),
            };
          },
        }
      : {}),
    dispatch: async (job) => {
      queue.push(job);
    },
    hydrate: async (job) =>
      job.firstIds.map((ref) => {
        const fact = facts.get(ref.accountId)!.find((f) => f.id === ref.id)!;
        hydrationReads++;
        hydrationReadUnits += Math.ceil(
          bytes({ PK: `FINANCE#FACT#${fact.id}`, SK: 'CURRENT', fact }) / 4096,
        );
        return fact;
      }),
  });
  const id = await service.create({
    userId: '01K7USER0000000000000000000',
    accountIds: ids,
    sourceRevisions: Object.fromEntries([
      ['$authorization', 'f'.repeat(64)],
      ...ids.map((id) => [id, 'r'.repeat(64)]),
    ]),
    securityRevision: 1,
    filters: { accountIds: ids },
    requestId: 'synthetic-query',
  });
  const drain = async () => {
    while (queue.length) {
      const next = queue.shift();
      await service.step(next.userId, next.queryId);
    }
  };
  await drain();
  const first = await service.page('01K7USER0000000000000000000', id, { limit: 200 });
  if (
    first.totalCount !== accounts * each ||
    first.totalsByCurrency?.[0]?.amountMinor !== accounts * each * 100
  )
    throw new Error('Synthetic aggregate parity failed.');
  const snapshot = () => ({
    writeUnitsEstimate: writeUnits,
    metadataGets: gets,
    indexQueries: queries,
    factBatchGets: batchGets,
    indexAndFactReadUnitsEstimate: indexReadUnits + factReadUnits,
    hydrationReads,
    readUnitsIncludingHydrationEstimate: indexReadUnits + factReadUnits + hydrationReadUnits,
    candidates,
    maxItemBytes,
    retainedBytesEstimate: [...fixture.rows.values()].reduce((n, r) => n + bytes(r), 0),
    retainedItems: fixture.rows.size,
  });
  const root = snapshot();
  const pending = await service.page('01K7USER0000000000000000000', id, {
    limit: 200,
    cursor: first.nextCursor,
  });
  if (pending.rowsState !== 'searching')
    throw new Error('Expected bounded asynchronous continuation');
  await drain();
  const second = await service.page('01K7USER0000000000000000000', id, {
    limit: 200,
    cursor: first.nextCursor,
  });
  if (
    first.items.length !== 200 ||
    second.items.length !== 200 ||
    first.items.some((row) => second.items.some((other) => other.id === row.id))
  )
    throw new Error('Synthetic page parity failed.');
  return {
    compact,
    previewEnabled: compact,
    accounts,
    each,
    total: accounts * each,
    firstRows: first.items.length,
    secondRows: second.items.length,
    root,
    afterSecondWindow: snapshot(),
  };
}
async function main() {
  const scenarios = [
    await scenario(1, 2000, false),
    await scenario(50, 2000, false),
    await scenario(1, 2000),
    await scenario(50, 2000),
  ];
  console.log(
    JSON.stringify(
      {
        kind: 'offline-synthetic-query-sizing',
        estimatedBytesPerItem: 'UTF-8 JSON + 100',
        scenarios,
      },
      null,
      2,
    ),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
