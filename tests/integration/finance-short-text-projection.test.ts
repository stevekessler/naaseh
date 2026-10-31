import { describe, expect, it } from 'vitest';
import {
  createFinanceFact,
  SpendProjectionService,
} from '../../apps/api/src/finance/spend-projection-service.js';
import {
  shortTextPostingKey,
  textPostingOrdinals,
  textOrdinalKey,
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
});
