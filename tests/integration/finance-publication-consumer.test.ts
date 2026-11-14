import { describe, it, expect } from 'vitest';
import { financePublicationConsumerFixture as fixture } from '../fixtures/finance/publication.js';
import { experienceId } from '../fixtures/finance/experience.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

describe('private bounded account publication windows', () => {
  it('publishes a correction through journal/source steps and conditionally restores exact coverage without full enumeration', async () => {
    const f = await fixture();
    await f.change();
    expect(await f.consumer.step(f.accountId)).toMatchObject({ complete: false });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      state: 'ready',
      coverageVerified: true,
      coverageSourceCount: 2,
      coverageDependencies: { [f.PK]: 2, 'FINANCE#CATALOG': 1 },
    });
    expect(f.fullEnumerations()).toBe(1);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(300);
    expect(f.queries.every((input) => input.ConsistentRead && Number(input.Limit) <= 5)).toBe(true);
    expect(
      f.queries.some(
        (input) => input.ExpressionAttributeValues?.[':prefix'] === 'ROW#transactions#',
      ),
    ).toBe(false);
  });
  it('uses merchant reverse references to refresh dependent facts without scanning all canonical transactions', async () => {
    const f = await fixture();
    for (const [id, fact] of f.canonical) f.canonical.set(id, { ...fact, merchantName: 'After' });
    const unit = f.work();
    const key = { PK: 'FINANCE#CATALOG', SK: `ROW#merchants#${f.merchantId}` };
    await unit.put({
      ...key,
      collection: 'merchants',
      entryKey: f.merchantId,
      data: { id: f.merchantId, version: 2, name: 'After' },
    });
    const meta = await unit.get(f.catalog);
    await unit.put({ ...meta!, revision: 2 });
    await unit.commit({
      key: { PK: 'FIXTURE', SK: 'merchant' },
      fingerprint: 'merchant',
      result: true,
      expiresAt: 2_000_000_000,
    });
    await f.finish();
    expect(
      f.queries.some(
        (input) =>
          input.ExpressionAttributeValues?.[':pk'] ===
          `FINANCE#FACT_DEPENDENCY#merchant#${f.merchantId}`,
      ),
    ).toBe(true);
    for (const id of f.canonical.keys())
      expect(
        (f.rows.get(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))?.fact as FinanceFact)
          .merchantName,
      ).toBe('After');
    expect(f.fullEnumerations()).toBe(1);
  });
  it('enrolls a journal-proven new source and restores the exact account count', async () => {
    const f = await fixture();
    await f.change(experienceId(1002));
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 3,
      coverageVerified: true,
      coverageDependencyUseCounts: { [f.PK]: 3, 'FINANCE#CATALOG': 3 },
    });
  });
  it('resumes an interrupted source publication without duplicating its summary', async () => {
    const f = await fixture();
    await f.change();
    let interrupted = false;
    for (let step = 0; step < 60; step++) {
      f.failAt(f.writes + 2);
      try {
        await f.consumer.step(f.accountId);
      } catch (error) {
        expect(String(error)).toMatch(/interrupted/);
        interrupted = true;
        break;
      }
    }
    expect(interrupted).toBe(true);
    f.failAt(-1);
    await f.finish();
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(300);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });
  it('restarts a stale target window and coalesces later canonical input without double counting', async () => {
    const f = await fixture();
    await f.change();
    await f.consumer.step(f.accountId);
    for (let step = 0; step < 40 && !f.publications(); step++) await f.consumer.step(f.accountId);
    expect(f.publications()).toBeGreaterThan(0);
    await f.change(experienceId(1000), 400);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageVerified: true,
      coverageDependencies: { [f.PK]: 3, 'FINANCE#CATALOG': 1 },
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(500);
  });
  it('keeps coverage unavailable across a journal gap and resumes after the exact row is restored', async () => {
    const f = await fixture();
    await f.change();
    const row = [...f.rows.values()].find(
      (row) => row.PK === f.PK && row.SK.startsWith('PUBLICATION_CHANGE#'),
    )!;
    f.rows.delete(f.key(row));
    await expect(f.finish()).rejects.toThrow(/gap|revision|contiguous/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    f.rows.set(f.key(row), row);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });
  it('recovers lost step responses and competing invocations with one final source application', async () => {
    const f = await fixture();
    await f.change();
    f.loseResponseAt(f.writes + 1);
    await f.consumer.step(f.accountId);
    for (let step = 0; step < 40; step++) {
      const saved = f.rows.get(f.key({ ...f.marker, SK: 'PUBLICATION_WINDOW' }))?.data as {
        current?: { queue?: string[] };
      };
      if (saved.current?.queue?.length) break;
      await f.consumer.step(f.accountId);
    }
    const results = await Promise.allSettled([
      f.consumer.step(f.accountId),
      f.consumer.step(f.accountId),
    ]);
    expect(results.some((value) => value.status === 'fulfilled')).toBe(true);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageVerified: true,
    });
  });
  it('rejects an unknown saved checkpoint format instead of overwriting recovery work', async () => {
    const f = await fixture();
    await f.change();
    await f.consumer.step(f.accountId);
    const checkpoint = [...f.rows.values()].find(
      (row) => row.PK === f.marker.PK && row.SK === 'PUBLICATION_WINDOW',
    )!;
    (checkpoint.data as Record<string, unknown>).version = 99;
    const writes = f.writes;
    await expect(f.consumer.step(f.accountId)).rejects.toThrow(/checkpoint|format|window/i);
    expect(f.writes).toBe(writes);
  });
  it('enrolls newly discovered dependency scopes before ready and prunes them only after their last source use', async () => {
    const f = await fixture(),
      scope = 'FINANCE#SCOPE#GROUP#new',
      id = experienceId(1000);
    f.extraDependency(id, scope);
    await f.change(id);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { [scope]: 1 },
      coverageDependencyUseCounts: { [scope]: 1 },
    });
    expect(
      [...f.rows.values()].some(
        (row) => row.dependencyScope === scope && row.accountId === f.accountId,
      ),
    ).toBe(true);
    f.extraDependency(id);
    await f.change(id, 300);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))?.coverageDependencies).toEqual({
      [f.PK]: 3,
      'FINANCE#CATALOG': 1,
    });
    expect(f.rows.get(f.key(f.marker))?.coverageDependencyUseCounts).toEqual({
      [f.PK]: 2,
      'FINANCE#CATALOG': 2,
    });
  });
  it('walks a changed account through five-reference pages without a canonical scope scan', async () => {
    const f = await fixture();
    for (let index = 2; index < 6; index++) await f.change(experienceId(1000 + index));
    const unit = f.work(),
      account = await unit.get({ PK: f.PK, SK: `ROW#accounts#${f.accountId}` });
    await unit.put({ ...account!, data: { ...(account!.data as object), version: 2 } });
    const meta = await unit.get(f.meta);
    await unit.put({ ...meta!, revision: Number(meta!.revision) + 1 });
    await unit.commit({
      key: { PK: 'FIXTURE', SK: 'account' },
      fingerprint: 'account',
      result: true,
      expiresAt: 2_000_000_000,
    });
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 6,
      coverageVerified: true,
    });
    expect(
      f.queries.some(
        (input) =>
          input.ExpressionAttributeValues?.[':pk'] === `FINANCE#FACT_ACCOUNT#${f.accountId}` &&
          input.ExclusiveStartKey,
      ),
    ).toBe(true);
    expect(f.fullEnumerations()).toBe(1);
  });
  it('acknowledges unrelated metadata in five-revision batches with bounded checkpoint writes', async () => {
    const f = await fixture();
    for (let index = 0; index < 30; index++) {
      const unit = f.work(),
        id = experienceId(5000 + index);
      await unit.put({
        PK: f.PK,
        SK: `ROW#importJobs#${id}`,
        collection: 'importJobs',
        entryKey: id,
        data: { id, version: 1 },
      });
      const meta = await unit.get(f.meta);
      await unit.put({ ...meta!, revision: Number(meta!.revision) + 1 });
      await unit.commit({
        key: { PK: 'FIXTURE', SK: `job#${index}` },
        fingerprint: `job#${index}`,
        result: true,
        expiresAt: 2_000_000_000,
      });
    }
    const before = f.writes;
    await f.finish();
    expect(f.writes - before).toBe(9);
    expect(f.publications()).toBe(0);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { [f.PK]: 31 },
    });
  });
  it('skips unrelated account transactions while still refreshing linked original-expense dependencies', async () => {
    const f = await fixture(),
      foreignAccount = experienceId(9000);
    for (let index = 0; index < 12; index++) {
      const unit = f.work(),
        id = experienceId(6000 + index);
      const fact = {
        ...f.canonical.values().next().value!,
        id,
        accountId: foreignAccount,
        slices: [],
      };
      await unit.put({ ...f.row(fact), data: { ...fact, version: 1 } });
      const meta = await unit.get(f.meta);
      await unit.put({ ...meta!, revision: Number(meta!.revision) + 1 });
      await unit.commit({
        key: { PK: 'FIXTURE', SK: `foreign#${index}` },
        fingerprint: `foreign#${index}`,
        result: true,
        expiresAt: 2_000_000_000,
      });
    }
    await f.finish();
    expect(f.publications()).toBe(0);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageVerified: true,
    });
    expect(
      f.queries.some((input) =>
        String(input.ExpressionAttributeValues?.[':pk']).startsWith(
          'FINANCE#FACT_DEPENDENCY#originalExpense#',
        ),
      ),
    ).toBe(false);
    const g = await fixture(true),
      id = experienceId(1000),
      categoryId = experienceId(501);
    const credit = g.canonical.get(id)!;
    g.canonical.set(id, {
      ...credit,
      slices: credit.slices.map((slice) => ({ ...slice, categoryId })),
    });
    const unit = g.work(),
      originalKey = { PK: g.PK, SK: `ROW#transactions#${experienceId(9900)}` };
    const original = await unit.get(originalKey);
    await unit.put({ ...original!, data: { ...(original!.data as object), version: 2 } });
    const meta = await unit.get(g.meta);
    await unit.put({ ...meta!, revision: 2 });
    await unit.commit({
      key: { PK: 'FIXTURE', SK: 'original' },
      fingerprint: 'original',
      result: true,
      expiresAt: 2_000_000_000,
    });
    await g.finish();
    const published = g.rows.get(g.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))
      ?.fact as FinanceFact;
    expect(published.slices[0]?.categoryId).toBe(categoryId);
    expect(
      g.queries.some(
        (input) =>
          input.ExpressionAttributeValues?.[':pk'] ===
          `FINANCE#FACT_DEPENDENCY#originalExpense#${experienceId(9900)}`,
      ),
    ).toBe(true);
    expect(g.rows.get(g.key(g.marker))).toMatchObject({
      coverageVerified: true,
      coverageOriginalSourceUseCounts: { [experienceId(9000)]: 1 },
    });
  });
  it('yields large source indexes through the default consumer without overrunning a step write budget', async () => {
    const f = await fixture(false, 1, true),
      id = experienceId(1000);
    const description = Array.from({ length: 70 }, (_, index) => `word${index}`).join(' ');
    f.canonical.set(id, { ...f.canonical.get(id)!, description });
    await f.change(id);
    let complete = false;
    for (let step = 0; step < 160; step++) {
      const before = f.writes;
      complete = (await f.consumer.step(f.accountId)).complete;
      expect(f.writes - before).toBeLessThanOrEqual(2);
      if (complete) break;
    }
    expect(complete).toBe(true);
    expect(
      (f.rows.get(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))?.fact as FinanceFact)
        .description,
    ).toBe(description);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageVerified: true,
    });
  });
});

describe('bounded removal of user-deleted canonical transactions', () => {
  it('removes read references and reverses one source while preserving the exact remaining summary', async () => {
    const f = await fixture(true, 1, true),
      id = experienceId(1000);
    await f.remove(id);
    await f.finish();
    expect(f.rows.has(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))).toBe(false);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 1,
      originalSourceAccountIds: [],
      coverageDependencyUseCounts: { [f.PK]: 1, 'FINANCE#CATALOG': 1 },
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(100);
    expect(
      [...f.rows.values()].filter(
        (row) =>
          (row.PK.startsWith('FINANCE#FACT_ACCOUNT#') ||
            row.PK.startsWith('FINANCE#FACT_DEPENDENCY#')) &&
          row.transactionId === id,
      ),
    ).toHaveLength(0);
    expect(f.fullEnumerations()).toBe(1);
  });
  it('yields across long text cleanup and preserves the other source in shared bitmap buckets', async () => {
    const f = await fixture(false, 1, true),
      id = experienceId(1000);
    const prior = f.canonical.get(id)!;
    f.canonical.set(id, {
      ...prior,
      description: 'Synthetic ' + Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '),
    });
    await f.change(id);
    await f.finish();
    await f.remove(id);
    let complete = false,
      steps = 0;
    for (; steps < 200; steps++) {
      const writes = f.writes;
      complete = (await f.consumer.step(f.accountId)).complete;
      expect(f.writes - writes).toBeLessThanOrEqual(2);
      if (complete) break;
    }
    expect(complete).toBe(true);
    expect(steps).toBeGreaterThan(10);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT#${experienceId(1001)}`, SK: 'CURRENT' })),
    ).toBeDefined();
    const postings = [...f.rows.values()].filter((row) => row.codec === 'text-bitmap-v2');
    expect(postings.length).toBeGreaterThan(0);
    expect(postings.every((row) => (row.bits as Uint8Array)[0] === 2)).toBe(true);
  });
  it('recovers an interrupted cleanup and competing/lost responses without applying reversal twice', async () => {
    const f = await fixture(false, 1, true);
    await f.remove();
    await f.consumer.step(f.accountId);
    f.failAt(f.writes + 1);
    await expect(f.consumer.step(f.accountId)).rejects.toThrow(/interrupted/);
    f.failAt(-1);
    f.loseResponseAt(f.writes + 1);
    await f.consumer.step(f.accountId);
    await Promise.allSettled([f.consumer.step(f.accountId), f.consumer.step(f.accountId)]);
    await f.finish();
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 1,
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(100);
  });
  it('finishes an older pending correction before consuming a later physical deletion', async () => {
    const f = await fixture(false, 1, true),
      id = experienceId(1000);
    await f.change(id, 400);
    for (let step = 0; step < 40; step++) {
      await f.consumer.step(f.accountId);
      if (f.rows.get(f.key(f.marker))?.state === 'rebuilding') break;
    }
    expect(f.rows.get(f.key(f.marker))?.state).toBe('rebuilding');
    await f.remove(id);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 1,
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(100);
  });
  it('finishes frozen cleanup then publishes a recreated source instead of deleting its new projection', async () => {
    const f = await fixture(false, 1, true),
      id = experienceId(1000);
    await f.remove(id);
    for (let step = 0; step < 40; step++) {
      await f.consumer.step(f.accountId);
      if (f.rows.get(f.key(f.marker))?.state === 'rebuilding') break;
    }
    expect(f.rows.get(f.key(f.marker))?.state).toBe('rebuilding');
    await f.change(id, 400);
    await f.finish();
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 2,
    });
    expect(f.rows.get(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))).toMatchObject({
      fact: { amountMinor: -400 },
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(100);
  });
  it('consumes a creation followed by deletion before first publication without counting an absent source', async () => {
    for (const startPublication of [false, true]) {
      const f = await fixture(false, 1, true),
        id = experienceId(1002);
      await f.change(id);
      if (startPublication) {
        for (let step = 0; step < 40; step++) {
          await f.consumer.step(f.accountId);
          if (f.rows.get(f.key(f.marker))?.state === 'rebuilding') break;
        }
        expect(f.rows.get(f.key(f.marker))?.state).toBe('rebuilding');
      }
      await f.remove(id);
      await f.finish();
      expect(f.rows.get(f.key(f.marker))).toMatchObject({
        coverageVerified: true,
        coverageSourceCount: 2,
      });
      expect(f.rows.has(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))).toBe(false);
    }
  });
});
