import { describe, expect, it } from 'vitest';
import { financePublicationConsumerFixture as fixture } from '../fixtures/finance/publication.js';
import { experienceId } from '../fixtures/finance/experience.js';
const group = 'FINANCE#SCOPE#GROUP#group',
  other = 'FINANCE#SCOPE#GROUP#other';
const windowKey = (f: Awaited<ReturnType<typeof fixture>>) => ({
  ...f.marker,
  SK: 'PUBLICATION_WINDOW',
});
const summary = (f: Awaited<ReturnType<typeof fixture>>) =>
  f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
    ?.amountMinor;
describe('bounded account-scope relocation', () => {
  it('adopts the atomic move anchor and restores exact coverage without enumerating canonical history', async () => {
    const f = await fixture(false, 1, true);
    await f.move(group);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 2,
      coverageDependencies: { [group]: 1, 'FINANCE#CATALOG': 1 },
      coverageDependencyUseCounts: { [group]: 2, 'FINANCE#CATALOG': 2 },
    });
    expect(f.rows.get(f.key(f.marker))?.coverageDependencies).not.toHaveProperty(f.PK);
    expect(summary(f)).toBe(200);
    expect(f.fullEnumerations()).toBe(1);
    expect(f.queries.every((q) => q.ConsistentRead && Number(q.Limit) <= 5)).toBe(true);
    const corrupt = await fixture(false, 1, true);
    const contribution = corrupt.rows.get(
      corrupt.key({ PK: `FINANCE#TRANSACTION#${experienceId(1000)}`, SK: 'SPEND_CONTRIBUTION' }),
    )!.data as Record<string, unknown>;
    delete contribution.coverageApplication;
    await corrupt.move(group);
    await expect(corrupt.finish()).rejects.toThrow(/deferred|coverage|creation/i);
    expect(corrupt.rows.get(corrupt.key(corrupt.marker))?.coverageVerified).toBe(false);
    expect(
      Number(corrupt.rows.get(corrupt.key(corrupt.marker))?.coverageDeferredSourceCount),
    ).toBeGreaterThan(0);
    await corrupt.verifier.step(corrupt.accountId, { restart: true });
    for (let step = 0; step < 30; step++)
      if ((await corrupt.verifier.step(corrupt.accountId)).complete) break;
    await corrupt.finish();
    expect(corrupt.rows.get(corrupt.key(corrupt.marker))).toMatchObject({
      coverageVerified: true,
      coverageDeferredSourceCount: 0,
    });
    expect(
      [...corrupt.rows.values()].some((row) => row.SK.startsWith('PUBLICATION_DEFERRED#')),
    ).toBe(false);
  });
  it('replays chained moves and return-to-baseline moves using causal revision anchors', async () => {
    for (const target of [other, 'FINANCE#SCOPE#OWNER#owner']) {
      const f = await fixture(false, 1, true);
      await f.move(group);
      await f.change(experienceId(1002));
      await f.move(target);
      await f.finish();
      expect(f.rows.get(f.key(f.marker))).toMatchObject({
        coverageVerified: true,
        coverageSourceCount: 3,
        coverageDependencyUseCounts: { [target]: 3, 'FINANCE#CATALOG': 3 },
      });
      expect(summary(f)).toBe(200);
      expect(f.fullEnumerations()).toBe(1);
    }
  });
  it('proves creations on either side of a move and coalesces later correction without double counting', async () => {
    const f = await fixture(false, 1, true);
    await f.change(experienceId(1002));
    await f.move(group);
    await f.change(experienceId(1003));
    await f.change(experienceId(1000), 300);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 4,
      coverageDependencyUseCounts: { [group]: 4, 'FINANCE#CATALOG': 4 },
    });
    expect(summary(f)).toBe(400);
    expect(f.fullEnumerations()).toBe(1);
    const pending = await fixture(false, 1, true),
      id = experienceId(1002);
    await pending.change(id);
    for (let step = 0; step < 40; step++) {
      await pending.consumer.step(pending.accountId);
      if (pending.rows.get(pending.key(pending.marker))?.state === 'rebuilding') break;
    }
    expect(pending.rows.get(pending.key(pending.marker))?.state).toBe('rebuilding');
    await pending.move(group);
    await pending.remove(id);
    await pending.finish();
    expect(pending.rows.get(pending.key(pending.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 2,
    });
    expect(pending.rows.has(pending.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))).toBe(false);
  });
  it('resumes interrupted and competing move checkpoints after the current target advances', async () => {
    const f = await fixture(false, 1, true);
    await f.move(group);
    await f.consumer.step(f.accountId);
    f.failAt(f.writes + 1);
    await expect(f.consumer.step(f.accountId)).rejects.toThrow(/interrupted/);
    f.failAt(-1);
    f.loseResponseAt(f.writes + 1);
    await f.consumer.step(f.accountId);
    await Promise.allSettled([f.consumer.step(f.accountId), f.consumer.step(f.accountId)]);
    await f.change(experienceId(1000), 300);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 2,
    });
    expect(summary(f)).toBe(400);
  });
  it('keeps a moved account unavailable across a missing move journal and resumes after repair', async () => {
    const f = await fixture(false, 1, true);
    await f.move(group);
    const key = { PK: f.PK, SK: 'PUBLICATION_CHANGE#0000000000000002' },
      saved = f.rows.get(f.key(key))!;
    f.rows.delete(f.key(key));
    await expect(f.finish()).rejects.toThrow(/gap|revision|contiguous/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    f.rows.set(f.key(key), saved);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });
  it('rejects an unexplained account version jump instead of adopting an unproved new scope', async () => {
    const f = await fixture(false, 1, true);
    await f.move(group, 2);
    await expect(f.finish()).rejects.toThrow(/relocation|move|version/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    const window = f.rows.get(f.key(windowKey(f)))?.data as
      | { baseline?: Record<string, number> }
      | undefined;
    expect(window?.baseline).not.toHaveProperty(group);
  });
});
