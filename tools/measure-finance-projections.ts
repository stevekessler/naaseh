import { Buffer } from 'node:buffer';
import {
  financeFactReferences,
  SpendProjectionService,
} from '../apps/api/src/finance/spend-projection-service.js';
import { financeReadKeys } from '../apps/api/src/finance/read-repository.js';
import { FinanceUnitOfWork } from '../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../tests/fixtures/finance/persistence.js';
import type { FinanceFact } from '../apps/api/src/finance/query-contract.js';
import { createFinanceAccountReadSummary } from '../apps/api/src/finance/account-read-summary.js';
import {
  describeFinanceCanonicalChange,
  financePublicationJournalRecords,
} from '../apps/api/src/finance/publication-change-journal.js';
import {
  financeFactSearchText,
  financeTextGrams,
  textPostingKey,
  textOrdinalKey,
} from '../apps/api/src/finance/text-postings.js';

/**
 * Offline representation sizing, never a DynamoDB latency/capacity measurement.
 * Run with the committed esbuild: bundle this file for Node as CJS, then execute it.
 * JSON bytes plus 100 bytes/item is a planning estimate, not measured AWS billing.
 */
// Keep stdout machine-readable while preserving operational diagnostics on stderr.
delete process.env.NAASEH_FINANCE_PUBLICATION_EVENT_BUS;
console.info = (...values: unknown[]) => console.error(...values);

const sizes = new Map<string, { rows: number; estimatedBytes: number }>();
const add = (kind: string, row: object) => {
  const value = sizes.get(kind) ?? { rows: 0, estimatedBytes: 0 };
  value.rows++;
  value.estimatedBytes += Buffer.byteLength(JSON.stringify(row), 'utf8') + 100;
  sizes.set(kind, value);
};
const id = (ordinal: number) => `01K${String(ordinal).padStart(23, '0')}`;
const cardinalities = new Map<string, number>();
const textCardinalities = new Map<string, number>();
const shortRows = new Map<string, { PK: string; SK: string; month: string; baseOrdinal: number }>();
let references = 0;
let shortBitUpdates = 0;
const integerArgument = (name: string, fallback: number, maximum: number) => {
  const value = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  const count = value === undefined ? fallback : Number(value.slice(name.length + 3));
  if (!Number.isInteger(count) || count < 1 || count > maximum)
    throw new Error(`--${name} must be an integer between 1 and ${maximum}.`);
  return count;
};
const transactionCount = integerArgument('transactions', 100_000, 100_000);
const accountCount = integerArgument('accounts', 50, 50);
const sourceCount = (index: number) =>
  Math.max(0, Math.floor((transactionCount - 1 - index) / accountCount) + 1);
const monthArgument = process.argv.slice(2).find((value) => value.startsWith('--months='));
const calendarMonths = monthArgument ? Number(monthArgument.slice('--months='.length)) : 1;
if (!Number.isInteger(calendarMonths) || calendarMonths < 1 || calendarMonths > 240)
  throw new Error('--months must be an integer between 1 and 240.');
const ordinalCounters = new Map<string, { PK: string; SK: string; nextOrdinal: number }>();
const summaries = new Map<
  string,
  {
    PK: string;
    SK: string;
    currency: string;
    currencyExponent: number;
    amountMinor: number;
    version: number;
  }
>();
const ownerScope = `FINANCE#SCOPE#OWNER#${id(1)}`;
const coverageApplication = {
  version: 1,
  generation: 'c'.repeat(64),
  fingerprint: 'b'.repeat(64),
  dependencyScopes: ['FINANCE#CATALOG', ownerScope],
  originalSourceAccountIds: [],
};
const accountBaseline = (accountId: string, count: number) => ({
  PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`,
  SK: 'CURRENT',
  state: 'ready',
  coverageVerified: true,
  sourceScopeRevision: 1,
  revision: 1,
  coverageDependencies: { [ownerScope]: 1, 'FINANCE#CATALOG': 1 },
  coverageDigest: 'd'.repeat(64),
  sourceAccountProofVersion: 1,
  originalSourceAccountIds: [],
  coverageDependencyRegistryVersion: 1,
  sourceDependencyIndexVersion: 1,
  incrementalCoverageVersion: 1,
  coverageGeneration: coverageApplication.generation,
  coverageDependencyUseCounts: count ? { [ownerScope]: count, 'FINANCE#CATALOG': count } : {},
  coverageOriginalSourceUseCounts: {},
  coverageSourceCount: count,
  accountIndexOrderVersion: 1,
});
for (let index = 0; index < accountCount; index++)
  add('accountCoverageBaselines', accountBaseline(id(100 + index), sourceCount(index)));
const writeSamples: FinanceFact[] = [];
for (let index = 0; index < transactionCount; index++) {
  const accountId = id(100 + (index % accountCount));
  const accountOrdinal = Math.floor(index / accountCount);
  const month = new Date(Date.UTC(2026, 9 - (accountOrdinal % calendarMonths), 1))
    .toISOString()
    .slice(0, 7);
  const ordinal = Math.floor(accountOrdinal / calendarMonths);
  const effectiveAt = `${month}-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`;
  const transactionId = id(1_000 + index);
  const amountMinor = -((index % 20_000) + 1);
  const fact: FinanceFact = {
    id: transactionId,
    accountId,
    effectiveAt,
    amountMinor,
    currency: 'USD',
    currencyExponent: 2,
    description: `Synthetic seeded purchase ${index % 1_000}`,
    payee: `Synthetic merchant ${index % 500}`,
    merchantId: id(200_000 + (index % 500)),
    sourceVersion: 1,
    sourceStatus: 'active',
    pending: index % 20 === 0,
    provisional: false,
    textMonth: month,
    textOrdinal: ordinal,
    slices:
      index % 20 === 0
        ? []
        : [
            {
              transactionId,
              accountId,
              effectiveAt,
              currency: 'USD',
              currencyExponent: 2,
              amountMinor: -amountMinor,
              merchantId: id(200_000 + (index % 500)),
              categoryId: id(201_000 + (index % 20)),
              budgetId: id(202_000 + (index % 20)),
              budgetItemId: id(203_000 + (index % 20)),
              originalAllocationId: id(300_000 + index),
            },
          ],
  };
  // Keep ongoing-write calibration in one current month, independent of retained history.
  if (index < 100) {
    const sampleDate = `2026-10-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`;
    writeSamples.push({
      ...fact,
      effectiveAt: sampleDate,
      textMonth: '2026-10',
      textOrdinal: accountOrdinal,
      slices: fact.slices.map((slice) => ({ ...slice, effectiveAt: sampleDate })),
    });
  }
  add('facts', { ...financeReadKeys.fact(fact.id), fact });
  add('ordinalCopies', { ...textOrdinalKey(accountId, month, ordinal), fact });
  const counter = {
    PK: `FINANCE#TEXT_ORDINAL#${accountId}#${month}`,
    SK: 'CURRENT',
    nextOrdinal: ordinal + 1,
  };
  ordinalCounters.set(counter.PK, counter);
  for (const slice of fact.slices) {
    const key = { PK: `FINANCE#SUMMARY#${accountId}#${slice.currency}`, SK: `MONTH#UTC#${month}` };
    const old = summaries.get(JSON.stringify(key));
    summaries.set(JSON.stringify(key), {
      ...key,
      currency: slice.currency,
      currencyExponent: slice.currencyExponent,
      amountMinor: (old?.amountMinor ?? 0) + slice.amountMinor,
      version: (old?.version ?? 0) + 1,
    });
  }
  // Completed checkpoints retain transition identity; unfinished batches retain both facts.
  add('correctedCheckpoints', {
    PK: `FINANCE#TRANSACTION#${fact.id}`,
    SK: 'SPEND_CONTRIBUTION',
    data: {
      operation: 'a'.repeat(64),
      fingerprint: 'b'.repeat(64),
      offset: 200,
      state: 'complete',
      calendarBasis: 'UTC',
      previousCalendarBasis: 'UTC',
      sourceScopeRevision: 1,
      startedAt: 1793462400000,
      textPostingVersion: 2,
      previousTextPostingVersion: 2,
      dependencyIndexVersion: 1,
      coverageApplication,
    },
  });
  for (const reference of financeFactReferences(fact)) {
    add('references', {
      ...reference,
      ...(reference.PK === financeReadKeys.account(fact.accountId)
        ? { aggregate: createFinanceAccountReadSummary(fact) }
        : {}),
    });
    if (!reference.PK.startsWith('FINANCE#FACT_DEPENDENCY#'))
      cardinalities.set(reference.PK, (cardinalities.get(reference.PK) ?? 0) + 1);
    references++;
  }
  for (const gram of financeTextGrams(financeFactSearchText(fact), 1, 3)) {
    const key = textPostingKey(accountId, gram, month, ordinal);
    if (!shortRows.has(JSON.stringify(key)))
      textCardinalities.set(key.PK, (textCardinalities.get(key.PK) ?? 0) + 1);
    shortRows.set(JSON.stringify(key), {
      ...key,
      month,
      baseOrdinal: Math.floor(ordinal / 500) * 500,
    });
    shortBitUpdates++;
  }
}
for (const row of ordinalCounters.values()) add('ordinalCounters', row);
for (const row of summaries.values()) add('monthlySummaries', row);
for (const row of shortRows.values())
  add('shortPostings', {
    ...row,
    codec: 'text-bitmap-v2',
    bits: Buffer.alloc(63).toString('base64'),
  });
for (const [PK, facts] of cardinalities) add('cardinalities', { PK, SK: 'CARDINALITY', facts });
for (const [PK, chunks] of textCardinalities)
  add('cardinalities', { PK, SK: 'CARDINALITY', estimateKind: 'posting-chunks-v1', chunks });
const estimatedBytes = [...sizes.values()].reduce((sum, value) => sum + value.estimatedBytes, 0);
const canonicalJournalSamples = [1, 10, 40].map((sourceCount) => {
  const PK = 'FINANCE#SCOPE#OWNER#synthetic-owner';
  const changes = writeSamples.slice(0, sourceCount).map((fact) => {
    const row = {
      PK,
      SK: `ROW#transactions#${fact.id}`,
      collection: 'transactions',
      entryKey: fact.id,
      data: { id: fact.id, accountId: fact.accountId, version: 1 },
    };
    return describeFinanceCanonicalChange(row, row, { ...row, data: { ...row.data, version: 2 } })!;
  });
  const records = financePublicationJournalRecords(changes, [
    { PK, beforeRevision: 1, afterRevision: 2 },
  ]);
  const estimated = records.map((row) => Buffer.byteLength(JSON.stringify(row), 'utf8') + 100);
  return {
    sourceCount,
    scopeCount: 1,
    recordCount: records.length,
    estimatedBytes: estimated.reduce((sum, value) => sum + value, 0),
    estimatedTransactionalWriteUnits: estimated.reduce(
      (sum, value) => sum + 2 * Math.ceil(value / 1024),
      0,
    ),
  };
});
async function measureWrites() {
  const fixture = financePersistenceFixture();
  for (let index = 0; index < accountCount; index++) {
    const marker = accountBaseline(id(100 + index), sourceCount(index));
    fixture.rows.set(fixture.key(marker), marker);
  }
  let writeUnits = 0;
  let reads = 0;
  const work = () =>
    new FinanceUnitOfWork(
      {
        get: async (key) => {
          reads++;
          return fixture.persistence.get(key);
        },
        write: async (items) => {
          for (const entry of items) {
            const operation = entry.Put ?? entry.Delete;
            if (!operation) continue;
            const key = ('Item' in operation ? operation.Item : operation.Key) as {
              PK: string;
              SK: string;
            };
            const previous = fixture.rows.get(fixture.key(key));
            const bytes = (value: unknown) =>
              value ? Buffer.byteLength(JSON.stringify(value), 'utf8') + 100 : 0;
            const next = entry.Put?.Item;
            writeUnits += 2 * Math.ceil(Math.max(bytes(previous), bytes(next), 1) / 1024);
          }
          await fixture.persistence.write(items);
        },
      },
      'table',
    );
  const service = new SpendProjectionService(work);
  for (const fact of writeSamples) await service.publish(fact);
  const createUnits = writeUnits;
  // Model corrections to sources whose first publication was included in coverage.
  // Applying incremental coverage is a separate, excluded write cost.
  for (const fact of writeSamples) {
    const row = fixture.rows.get(
      fixture.key({ PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' }),
    )!;
    (row.data as Record<string, unknown>).coverageApplication = coverageApplication;
  }
  for (const fact of writeSamples)
    await service.publish({
      ...fact,
      sourceVersion: 2,
      description: `${fact.description} corrected`,
    });
  const correctionUnits = writeUnits - createUnits;
  const createAndCorrectionReads = reads;
  // Seed only private canonical-deletion evidence. Canonical/journal writes are
  // excluded here, just as canonical create/correction writes are excluded above.
  let revision = 1;
  for (const fact of writeSamples) {
    const source = {
      PK: ownerScope,
      SK: `ROW#transactions#${fact.id}`,
      collection: 'transactions',
      entryKey: fact.id,
      data: { id: fact.id, accountId: fact.accountId, version: 2 },
    };
    const records = financePublicationJournalRecords(
      [describeFinanceCanonicalChange(source, source)!],
      [{ PK: ownerScope, beforeRevision: revision, afterRevision: ++revision }],
    );
    for (const row of records) fixture.rows.set(fixture.key(row), row);
  }
  fixture.rows.set(fixture.key({ PK: ownerScope, SK: 'META' }), {
    PK: ownerScope,
    SK: 'META',
    revision,
  });
  const beforeDeletionUnits = writeUnits;
  for (const fact of writeSamples) {
    let complete = false;
    for (let step = 0; step < 100; step++) {
      if (await service.removeStep(fact.id, fact.accountId)) {
        complete = true;
        break;
      }
    }
    if (!complete) throw new Error('Offline deletion calibration did not converge.');
  }
  return {
    sampleCount: writeSamples.length,
    createEstimatedWriteUnits: createUnits,
    correctionEstimatedWriteUnits: correctionUnits,
    createEstimatedWriteUnitsPerSource: createUnits / writeSamples.length,
    correctionEstimatedWriteUnitsPerSource: correctionUnits / writeSamples.length,
    deletionEstimatedWriteUnits: writeUnits - beforeDeletionUnits,
    deletionEstimatedWriteUnitsPerSource: (writeUnits - beforeDeletionUnits) / writeSamples.length,
    createAndCorrectionStrongGetCalls: createAndCorrectionReads,
    deletionStrongGetCalls: reads - createAndCorrectionReads,
    strongGetCalls: reads,
    method:
      'Generated transactional puts/deletes, 2 * ceil(max(old,new) JSON-estimated item bytes/1024); no AWS consumed capacity',
    excludes: [
      'canonical writes',
      'conflict retries',
      'read/condition-check capacity',
      'GSI writes',
      'create/correction coverage application/finalization writes (deletion subtraction is included)',
    ],
  };
}
void measureWrites()
  .then((writeAmplification) =>
    console.log(
      JSON.stringify(
        {
          evidence: 'offline synthetic representation estimate; no AWS calls',
          accountCount,
          transactionCount,
          calendarMonths,
          bytesMethod: 'UTF-8 JSON plus 100 bytes per retained item; binary represented as base64',
          excludes: [
            'TTL receipts/query jobs',
            'canonical Finance 015 rows',
            'receipt/security/upcoming metadata',
            'GSI overhead',
            'multiple currencies/calendar bases',
            'AWS consumed capacity and latency',
          ],
          categories: Object.fromEntries(sizes),
          writeAmplification,
          canonicalJournalSamples,
          estimatedBytes,
          estimatedDecimalGB: estimatedBytes / 1e9,
          referencesPerTransaction: references / transactionCount,
          shortBitUpdatesPerTransaction: shortBitUpdates / transactionCount,
          caveat:
            'Month distribution, text length, unique grams and updates change these estimates; this is not a cost acceptance PASS.',
        },
        null,
        2,
      ),
    ),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
