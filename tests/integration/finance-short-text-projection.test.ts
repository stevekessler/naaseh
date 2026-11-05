import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createFinanceFact,
  SpendProjectionService,
} from '../../apps/api/src/finance/spend-projection-service.js';
import {
  shortTextPostingKey,
  textPostingOrdinals,
  textOrdinalKey,
  financeTextGrams,
  financeFactSearchText,
} from '../../apps/api/src/finance/text-postings.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

describe('shared short-text index publication', () => {
  it('packs shared short grams and clears only the corrected source while preserving its neighbor', async () => {
    const f = financePersistenceFixture();
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    const source = buildExperienceFixture().transactions[10]!;
    const first = createFinanceFact({ ...source, description: 'apple' }, {});
    const second = { ...first, id: experienceId(999) };
    await service.publish(first);
    await service.publish(second);
    const key = shortTextPostingKey(first.accountId, 'ap', '2026-10', 0);
    expect(textPostingOrdinals(f.rows.get(f.key(key))!.bits as Uint8Array, 0)).toEqual([1, 0]);
    const dictionary = f.rows.get(f.key(textOrdinalKey(first.accountId, '2026-10', 0)))!;
    expect(dictionary.fact).toMatchObject({ id: first.id, textOrdinal: 0, textMonth: '2026-10' });
    await service.publish({ ...first, sourceVersion: 2, description: 'zebra' });
    expect(textPostingOrdinals(f.rows.get(f.key(key))!.bits as Uint8Array, 0)).toEqual([1]);
    expect(
      f.rows.get(f.key(shortTextPostingKey(first.accountId, 'ze', '2026-10', 0))),
    ).toBeTruthy();
  });

  it('moves a corrected source to its new month and removes the old ordinal and empty posting', async () => {
    const f = financePersistenceFixture();
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    const source = buildExperienceFixture().transactions[10]!;
    const fact = createFinanceFact({ ...source, description: '🙂a' }, {});
    await service.publish(fact);
    const next = {
      ...fact,
      sourceVersion: 2,
      effectiveAt: '2026-11-01T00:00:00.000Z',
      slices: fact.slices.map((slice) => ({ ...slice, effectiveAt: '2026-11-01T00:00:00.000Z' })),
    };
    await service.publish(next);
    expect(f.rows.has(f.key(shortTextPostingKey(fact.accountId, '🙂', '2026-10', 0)))).toBe(false);
    expect(f.rows.has(f.key(textOrdinalKey(fact.accountId, '2026-10', 0)))).toBe(false);
    expect(f.rows.get(f.key(textOrdinalKey(fact.accountId, '2026-11', 0)))?.fact).toMatchObject({
      id: fact.id,
    });
  });

  it('packs and reverses shared three-character grams without dropping a neighboring source', async () => {
    const f = financePersistenceFixture();
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    const source = buildExperienceFixture().transactions[10]!;
    const first = createFinanceFact({ ...source, description: 'apple' }, {});
    await service.publish(first);
    await service.publish({ ...first, id: experienceId(999) });
    const key = {
      PK: `FINANCE#FACT_SEARCH#${first.accountId}#text#app`,
      SK: 'DATE#2026-10#000000000000',
    };
    expect(f.rows.get(f.key(key))?.codec).toBe('text-bitmap-v2');
    expect(textPostingOrdinals(f.rows.get(f.key(key))!.bits as Uint8Array, 0)).toEqual([1, 0]);
    await service.publish({ ...first, sourceVersion: 2, description: 'zebra' });
    expect(textPostingOrdinals(f.rows.get(f.key(key))!.bits as Uint8Array, 0)).toEqual([1]);
  });

  it('rebuilds legacy long-text references into bitmaps with unchanged source contribution', async () => {
    const f = financePersistenceFixture();
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    const fact = createFinanceFact(
      { ...buildExperienceFixture().transactions[10]!, description: 'apple' },
      {},
    );
    await service.publish(fact);
    const checkpointKey = { PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    const checkpoint = f.rows.get(f.key(checkpointKey))!.data as Record<string, unknown>;
    delete checkpoint.textPostingVersion;
    checkpoint.fingerprint = 'legacy-v1-input';
    for (const gram of financeTextGrams(financeFactSearchText(fact), 3, 3)) {
      const PK = `FINANCE#FACT_SEARCH#${fact.accountId}#text#${encodeURIComponent(gram)}`;
      const key = { PK, SK: `DATE#${fact.effectiveAt}#${fact.id}` };
      f.rows.set(f.key(key), { ...key, transactionId: fact.id });
      f.rows.delete(f.key({ PK, SK: 'DATE#2026-10#000000000000' }));
      f.rows.set(f.key({ PK, SK: 'CARDINALITY' }), { PK, SK: 'CARDINALITY', facts: 1 });
    }
    await service.publish(fact);
    const PK = `FINANCE#FACT_SEARCH#${fact.accountId}#text#app`;
    expect(f.rows.has(f.key({ PK, SK: `DATE#${fact.effectiveAt}#${fact.id}` }))).toBe(false);
    expect(f.rows.get(f.key({ PK, SK: 'DATE#2026-10#000000000000' }))?.codec).toBe(
      'text-bitmap-v2',
    );
    expect(f.rows.get(f.key({ PK, SK: 'CARDINALITY' }))?.facts).toBe(1);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(800);
  });

  it('finishes an interrupted legacy batch before rebuilding the new text representation', async () => {
    const f = financePersistenceFixture();
    const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
    const fact = createFinanceFact(
      { ...buildExperienceFixture().transactions[10]!, description: 'apple orchard purchase' },
      {},
    );
    const operation = createHash('sha256')
      .update(JSON.stringify({ next: fact, calendarBasis: 'UTC' }))
      .digest('hex');
    const checkpointKey = { PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    f.rows.set(f.key(checkpointKey), {
      ...checkpointKey,
      data: {
        operation,
        offset: 0,
        next: { ...fact, textOrdinal: 0, textMonth: '2026-10' },
        state: 'rebuilding',
      },
    });
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' };
    f.rows.set(f.key(markerKey), { ...markerKey, operation, revision: 1, state: 'rebuilding' });
    f.failAt(2);
    await expect(service.publish(fact)).rejects.toThrow(/interrupted/);
    expect((f.rows.get(f.key(checkpointKey))!.data as { offset: number }).offset).toBeGreaterThan(
      0,
    );
    await service.publish(fact);
    const PK = `FINANCE#FACT_SEARCH#${fact.accountId}#text#app`;
    expect(f.rows.get(f.key({ PK, SK: 'DATE#2026-10#000000000000' }))?.codec).toBe(
      'text-bitmap-v2',
    );
    expect(f.rows.has(f.key({ PK, SK: `DATE#${fact.effectiveAt}#${fact.id}` }))).toBe(false);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(800);
    expect(f.rows.get(f.key(markerKey))).toMatchObject({
      state: 'awaiting-coverage',
      coverageVerified: false,
    });
  });
});
