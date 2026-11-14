import { financePublicationConsumerFixture } from '../tests/fixtures/finance/publication.js';
import { FinancePublicationOutboxConsumer } from '../apps/api/src/finance/publication-outbox-consumer.js';
import { experienceId } from '../tests/fixtures/finance/experience.js';
import type { FinanceFact } from '../apps/api/src/finance/query-contract.js';

/** Generated-command estimate only: synthetic new rows, injected persistence, no AWS calls. */
delete process.env.NAASEH_FINANCE_PUBLICATION_EVENT_BUS;
console.info = (...values: unknown[]) => console.error(...values);
const bytes = (value: unknown) => (value ? Buffer.byteLength(JSON.stringify(value)) + 100 : 0);
const integerArgument = (name: string, fallback: number, maximum: number) => {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  const value = argument === undefined ? fallback : Number(argument.slice(name.length + 3));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`Invalid --${name} sizing argument.`);
  return value;
};
const sourceCount = integerArgument('sources', 80, 480);
const calendarMonths = integerArgument('months', 60, 60);
if (sourceCount % 8 !== 0) throw new Error('Synthetic source count must be divisible by eight.');
async function measure(commitSize: number) {
  const f = await financePublicationConsumerFixture(false, 8, true, 0);
  const groups = new Map<
    string,
    { transactions: number; writeUnits: number; conditions: number }
  >();
  const originalWrite = f.persistence.write;
  let gets = 0;
  const originalGet = f.persistence.get;
  f.persistence.get = async (key) => {
    gets++;
    return originalGet(key);
  };
  f.persistence.write = async (items) => {
    const names = items.map((item) => String(item.Put?.Item?.SK ?? ''));
    const group = names.some((name) => name.startsWith('PROJECTION_RECEIPT#'))
      ? 'source'
      : names.some((name) => name.startsWith('COVERAGE_APPLICATION_RECEIPT#'))
        ? 'coverage'
        : names.some((name) => name.startsWith('PUBLICATION_WINDOW_RECEIPT#'))
          ? 'window'
          : names.some((name) => name.startsWith('PUBLICATION_RECEIPT#'))
            ? 'routing'
            : 'canonical-and-journal';
    const stats = groups.get(group) ?? { transactions: 0, writeUnits: 0, conditions: 0 };
    stats.transactions++;
    for (const item of items) {
      if (item.ConditionCheck) {
        stats.conditions++;
        continue;
      }
      const operation = item.Put ?? item.Delete;
      if (!operation) throw new Error('Unsupported sizing operation.');
      const key = ('Item' in operation ? operation.Item : operation.Key) as {
        PK: string;
        SK: string;
      };
      stats.writeUnits +=
        2 * Math.ceil(Math.max(1, bytes(f.rows.get(f.key(key))), bytes(item.Put?.Item)) / 1024);
    }
    groups.set(group, stats);
    await originalWrite(items);
  };
  const facts: FinanceFact[] = Array.from({ length: sourceCount }, (_, index) => {
    const accountId = f.accountIds[index % 8]!;
    const effectiveAt = new Date(
      Date.UTC(2026, 9 - (Math.floor(index / 8) % calendarMonths), (index % 28) + 1, 12),
    ).toISOString();
    const id = experienceId(50_000 + index);
    return {
      id,
      accountId,
      effectiveAt,
      amountMinor: -100,
      currency: 'USD',
      currencyExponent: 2,
      description: `Synthetic seeded purchase ${index % 1000}`,
      payee: `Synthetic merchant ${index % 500}`,
      merchantId: f.merchantId,
      sourceVersion: 1,
      sourceStatus: 'active',
      pending: false,
      provisional: false,
      slices: [
        {
          transactionId: id,
          accountId,
          effectiveAt,
          amountMinor: 100,
          currency: 'USD',
          currencyExponent: 2,
          merchantId: f.merchantId,
        },
      ],
    };
  });
  for (let offset = 0; offset < facts.length; offset += commitSize)
    await f.createFacts(facts.slice(offset, offset + commitSize));
  const worker = new FinancePublicationOutboxConsumer({
    work: f.work,
    impact: f.impact,
    account: f.consumer,
  });
  const ids = [...f.rows.values()]
    .filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')
    .map((row) => String(row.id));
  let steps = 0;
  for (const id of ids) {
    let complete = false;
    for (let step = 0; step < 20_000; step++) {
      steps++;
      if ((await worker.step(id)).complete) {
        complete = true;
        break;
      }
    }
    if (!complete) throw new Error('Synthetic ingestion publication did not converge.');
  }
  for (const accountId of f.accountIds) {
    const marker = f.rows.get(
      f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' }),
    );
    if (marker?.coverageVerified !== true || marker.coverageSourceCount !== sourceCount / 8)
      throw new Error('Synthetic ingestion coverage is incomplete.');
  }
  if ([...f.rows.values()].some((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'))
    throw new Error('Pending synthetic ingestion work remains.');
  return {
    commitSize,
    sourceCount,
    accounts: 8,
    sampledMonthsPerAccount: Math.min(calendarMonths, sourceCount / 8),
    canonicalCommits: ids.length,
    outboxSteps: steps,
    strongGetCalls: gets,
    indexedQueries: f.queries.length,
    groups: Object.fromEntries(groups),
    estimatedWriteUnits: [...groups.values()].reduce((sum, stats) => sum + stats.writeUnits, 0),
  };
}
async function main() {
  const results = [];
  for (const size of [1, 20]) results.push(await measure(size));
  process.stdout.write(
    JSON.stringify(
      {
        date: new Date().toISOString().slice(0, 10),
        evidence:
          'Offline canonical-row/publication generated commands for new ingestion; no AWS calls.',
        method:
          'Transactional puts/deletes: 2 * ceil(max(old,new) UTF-8 JSON bytes + 100/item /1024). Conditions/get/query calls are not consumed read units.',
        excludes: [
          'Initial empty-account creation/trusted baseline setup',
          'CSV/provider validation, feeds, receipts, authentication and canonical source resolution reads',
          'Real consumed capacity, retries, compute, p95, storage billing and actual 15,000-row import',
        ],
        caveat:
          'Synthetic new-row cohort only; five-year/15,000-row totals remain extrapolations. Existing monthly/stress evidence is retained.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
