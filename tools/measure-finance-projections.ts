import { Buffer } from 'node:buffer';
import {
  financeFactReferences,
  SpendProjectionService,
} from '../apps/api/src/finance/spend-projection-service.js';
import { financeReadKeys } from '../apps/api/src/finance/read-repository.js';
import { FinanceUnitOfWork } from '../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../tests/fixtures/finance/persistence.js';
import type { FinanceFact } from '../apps/api/src/finance/query-contract.js';
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
const shortRows = new Map<string, { PK: string; SK: string; month: string; baseOrdinal: number }>();
let references = 0;
let shortBitUpdates = 0;
const transactionCount = 100_000;
const writeSamples: FinanceFact[] = [];
for (let index = 0; index < transactionCount; index++) {
  const accountId = id(100 + (index % 50));
  const ordinal = Math.floor(index / 50);
  const effectiveAt = `2026-10-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`;
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
    textMonth: '2026-10',
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
              originalAllocationId: id(300_000 + index),
            },
          ],
  };
  if (index < 100) writeSamples.push(fact);
  add('facts', { ...financeReadKeys.fact(fact.id), fact });
  add('ordinalCopies', { ...textOrdinalKey(accountId, '2026-10', ordinal), fact });
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
    },
  });
  for (const reference of financeFactReferences(fact)) {
    add('references', reference);
    cardinalities.set(reference.PK, (cardinalities.get(reference.PK) ?? 0) + 1);
    references++;
  }
  for (const gram of financeTextGrams(financeFactSearchText(fact), 1, 3)) {
    const key = textPostingKey(accountId, gram, '2026-10', ordinal);
    shortRows.set(JSON.stringify(key), {
      ...key,
      month: '2026-10',
      baseOrdinal: Math.floor(ordinal / 500) * 500,
    });
    cardinalities.set(key.PK, (cardinalities.get(key.PK) ?? 0) + 1);
    shortBitUpdates++;
  }
}
for (const row of shortRows.values())
  add('shortPostings', {
    ...row,
    codec: 'text-bitmap-v2',
    bits: Buffer.alloc(63).toString('base64'),
  });
for (const [PK, facts] of cardinalities) add('cardinalities', { PK, SK: 'CARDINALITY', facts });
const estimatedBytes = [...sizes.values()].reduce((sum, value) => sum + value.estimatedBytes, 0);
async function measureWrites() {
  const fixture = financePersistenceFixture();
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
  for (const fact of writeSamples)
    await service.publish({
      ...fact,
      sourceVersion: 2,
      description: `${fact.description} corrected`,
    });
  return {
    sampleCount: writeSamples.length,
    createEstimatedWriteUnits: createUnits,
    correctionEstimatedWriteUnits: writeUnits - createUnits,
    createEstimatedWriteUnitsPerSource: createUnits / writeSamples.length,
    correctionEstimatedWriteUnitsPerSource: (writeUnits - createUnits) / writeSamples.length,
    strongGetCalls: reads,
    method:
      'Generated transactional puts/deletes, 2 * ceil(max(old,new) JSON-estimated item bytes/1024); no AWS consumed capacity',
    excludes: [
      'canonical writes',
      'conflict retries',
      'read/condition-check capacity',
      'GSI writes',
    ],
  };
}
void measureWrites()
  .then((writeAmplification) =>
    console.log(
      JSON.stringify(
        {
          evidence: 'offline synthetic representation estimate; no AWS calls',
          accountCount: 50,
          transactionCount,
          calendarMonths: 1,
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
