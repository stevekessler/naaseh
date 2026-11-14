import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { financePublicationConsumerFixture as fixture } from '../fixtures/finance/publication.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import {
  FinanceAccountRetirement,
  isFinanceAccountRetired,
} from '../../apps/api/src/finance/account-retirement.js';
import { FinancePublicationOutboxConsumer } from '../../apps/api/src/finance/publication-outbox-consumer.js';
import { initializeFinanceProjectionAccount } from '../../apps/api/src/finance/account-publication-bootstrap.js';
async function accountChange(
  f: Awaited<ReturnType<typeof fixture>>,
  remove: boolean,
  id = f.accountId,
  PK = f.PK,
) {
  const unit = f.work(),
    locator = financeLocatorKey('accounts', id),
    key = { PK, SK: `ROW#accounts#${id}` };
  if (remove) {
    await unit.delete(key);
    await unit.delete(locator);
  } else {
    await unit.put({ ...key, collection: 'accounts', entryKey: id, data: { id, version: 1 } });
    await unit.put({ ...locator, storageKey: key });
  }
  const meta = await unit.get({ PK, SK: 'META' });
  await unit.put({ ...meta, PK, SK: 'META', revision: Number(meta?.revision ?? 0) + 1 });
  await unit.commit({
    key: { PK: 'FIXTURE', SK: `account#${id}#${remove}#${Number(meta?.revision ?? 0) + 1}` },
    fingerprint: `${id}:${remove}:${Number(meta?.revision ?? 0) + 1}`,
    result: true,
    expiresAt: 2_000_000_000,
  });
  return [...f.rows.values()].find(
    (row) =>
      row.PK === 'FINANCE#PUBLICATION_OUTBOX' &&
      (row.scopes as Array<{ PK: string; afterRevision: number }>).some(
        (s) => s.PK === PK && s.afterRevision === Number(meta?.revision ?? 0) + 1,
      ),
  )!.id as string;
}
const retire = (f: Awaited<ReturnType<typeof fixture>>) =>
  new FinanceAccountRetirement({
    work: f.work,
    accountPage: async (id) => {
      const page = await f.query({
        ConsistentRead: true,
        Limit: 5,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `FINANCE#FACT_ACCOUNT#${id}`, ':prefix': 'DATE#' },
      });
      return { rows: page.Items };
    },
  });
async function finish(worker: FinancePublicationOutboxConsumer, id: string) {
  for (let step = 0; step < 500; step++) if ((await worker.step(id)).complete) return;
  throw new Error('Retirement outbox did not converge');
}
async function cleared() {
  const f = await fixture(false, 1, true);
  for (const id of [...f.canonical.keys()]) await f.remove(id);
  await f.finish();
  return f;
}
describe('proven bounded account retirement', () => {
  it('retires a verified empty account and ignores its stale directory entries in later publications', async () => {
    const f = await cleared(),
      id = await accountChange(f, true);
    const worker = new FinancePublicationOutboxConsumer({
      work: f.work,
      account: f.consumer,
      impact: f.impact,
    });
    await finish(worker, id);
    const marker = f.rows.get(f.key(f.marker))!;
    expect(isFinanceAccountRetired(marker, f.accountId)).toBe(true);
    expect(marker).not.toHaveProperty('expiresAt');
    expect((await f.impact.accounts(f.PK)).accountIds).not.toContain(f.accountId);
    expect(await f.consumer.step(f.accountId)).toEqual({ complete: true });
    f.rows.delete(
      f.key({ PK: `FINANCE#PUBLICATION_ACCOUNT_DELETION#${f.accountId}`, SK: 'CURRENT' }),
    );
    expect(await f.consumer.step(f.accountId)).toEqual({ complete: true });
    const legacy = {
      PK: f.PK,
      SK: `ROW#accounts#${createHash('sha256').update(f.accountId).digest('hex')}`,
      collection: 'accounts',
      entryKey: f.accountId,
      data: { id: f.accountId, version: 1 },
    };
    f.rows.set(f.key(legacy), legacy);
    expect(await retire(f).step(f.accountId)).toEqual({ handled: false, complete: false });
    f.rows.delete(f.key(legacy));
    expect(
      isFinanceAccountRetired(
        { ...marker, scopeRevision: Number(marker.scopeRevision) + 1 },
        f.accountId,
      ),
    ).toBe(false);
  });
  it('finishes earlier user-deleted sources in bounded steps before retiring their absent account', async () => {
    const f = await fixture(false, 1, true);
    await f.change(experienceId(1000), 400);
    for (let step = 0; step < 40; step++) {
      await f.consumer.step(f.accountId);
      if (f.rows.get(f.key(f.marker))?.state === 'rebuilding') break;
    }
    expect(f.rows.get(f.key(f.marker))?.state).toBe('rebuilding');
    for (const id of [...f.canonical.keys()]) await f.remove(id);
    const id = await accountChange(f, true),
      service = retire(f);
    let complete = false;
    for (let step = 0; step < 100; step++) {
      const writes = f.writes;
      complete = (await service.step(f.accountId)).complete;
      expect(f.writes - writes).toBeLessThanOrEqual(1);
      if (complete) break;
    }
    expect(complete).toBe(true);
    expect(isFinanceAccountRetired(f.rows.get(f.key(f.marker)), f.accountId)).toBe(true);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(0);
    expect(f.fullEnumerations()).toBe(1);
    await finish(
      new FinancePublicationOutboxConsumer({ work: f.work, account: f.consumer, impact: f.impact }),
      id,
    );
  });
  it('recovers an interrupted final write and competing/lost responses without replacing other state', async () => {
    const f = await cleared();
    await accountChange(f, true);
    f.failAt(f.writes + 1);
    await expect(retire(f).step(f.accountId)).rejects.toThrow(/interrupted/);
    f.failAt(-1);
    f.loseResponseAt(f.writes + 1);
    await Promise.allSettled([retire(f).step(f.accountId), retire(f).step(f.accountId)]);
    expect((await retire(f).step(f.accountId)).complete).toBe(true);
    expect(isFinanceAccountRetired(f.rows.get(f.key(f.marker)), f.accountId)).toBe(true);
    expect(f.rows.get(f.key(f.catalog))).toMatchObject({ revision: 1 });
  });
  it('cleans an account deleted after relocation without needing a live canonical account', async () => {
    const f = await fixture(false, 1, true),
      PK = 'FINANCE#SCOPE#GROUP#retirement';
    await f.move(PK);
    for (const id of [...f.canonical.keys()]) await f.remove(id);
    await accountChange(f, true, f.accountId, PK);
    for (let step = 0; step < 100; step++) if ((await retire(f).step(f.accountId)).complete) break;
    expect(isFinanceAccountRetired(f.rows.get(f.key(f.marker)), f.accountId)).toBe(true);
    expect(f.fullEnumerations()).toBe(1);
  });
  it('never retires a recreated account and bootstraps its journal-proven empty new identity', async () => {
    const f = await cleared();
    await accountChange(f, true);
    await accountChange(f, false);
    expect(await retire(f).step(f.accountId)).toMatchObject({ handled: false, complete: false });
    await accountChange(f, true);
    expect((await retire(f).step(f.accountId)).complete).toBe(true);
    const id = await accountChange(f, false);
    await finish(
      new FinancePublicationOutboxConsumer({ work: f.work, account: f.consumer, impact: f.impact }),
      id,
    );
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      state: 'ready',
      coverageVerified: true,
      coverageSourceCount: 0,
    });
  });
  it('rejects missing deletion evidence instead of certifying absence from a missing live row', async () => {
    const f = await cleared();
    const snapshot = structuredClone(f.rows.get(f.key(f.marker)));
    f.rows.delete(f.key({ PK: f.PK, SK: `ROW#accounts#${f.accountId}` }));
    f.rows.delete(f.key(financeLocatorKey('accounts', f.accountId)));
    await expect(retire(f).step(f.accountId)).rejects.toThrow(/proof|deletion|retirement/i);
    expect(f.rows.get(f.key(f.marker))).toEqual(snapshot);
  });
  it('resolves birth and deletion before bootstrap only through the pending genuine birth proof', async () => {
    const f = await fixture(false, 1, true),
      accountId = experienceId(101);
    const birth = await accountChange(f, false, accountId),
      deletion = await accountChange(f, true, accountId);
    await expect(retire(f).step(accountId)).rejects.toThrow(/baseline|creation|birth/i);
    const worker = new FinancePublicationOutboxConsumer({
      work: f.work,
      account: f.consumer,
      impact: f.impact,
    });
    await finish(worker, birth);
    await finish(worker, deletion);
    expect(
      isFinanceAccountRetired(
        f.rows.get(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' })),
        accountId,
      ),
    ).toBe(true);
    const replacement = await accountChange(f, false, accountId);
    await expect(initializeFinanceProjectionAccount(accountId, birth, f.work)).rejects.toThrow(
      /birth|creation/i,
    );
    await finish(worker, replacement);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' })),
    ).toMatchObject({ state: 'ready', coverageSourceCount: 0 });
  });
  it('removes a new source that was publishing before its account disappeared without subtracting an unapplied count', async () => {
    const f = await fixture(false, 1, true),
      accountId = experienceId(101),
      id = experienceId(1100);
    const birth = await accountChange(f, false, accountId);
    await initializeFinanceProjectionAccount(accountId, birth, f.work);
    f.canonical.set(id, {
      ...f.canonical.values().next().value!,
      id,
      accountId,
      sourceVersion: 0,
      slices: [],
    });
    await f.change(id);
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    for (let step = 0; step < 80; step++) {
      await f.consumer.step(accountId);
      if (f.rows.get(f.key(markerKey))?.state === 'rebuilding') break;
    }
    expect(f.rows.get(f.key(markerKey))?.state).toBe('rebuilding');
    await f.remove(id);
    await accountChange(f, true, accountId);
    for (let step = 0; step < 30 && f.rows.get(f.key(markerKey))?.state === 'rebuilding'; step++)
      await retire(f).step(accountId);
    const unpublished = f.rows.get(
      f.key({ PK: `FINANCE#TRANSACTION#${id}`, SK: 'SPEND_CONTRIBUTION' }),
    )!.data as Record<string, unknown>;
    const generation = unpublished.creationCoverageGeneration;
    expect(generation).toBeDefined();
    unpublished.creationCoverageGeneration = 'a'.repeat(64);
    await expect(retire(f).step(accountId)).rejects.toThrow(/unapplied|creation/i);
    unpublished.creationCoverageGeneration = generation;
    let complete = false;
    for (let step = 0; step < 100; step++) {
      complete = (await retire(f).step(accountId)).complete;
      if (complete) break;
    }
    expect(complete).toBe(true);
    expect(isFinanceAccountRetired(f.rows.get(f.key(markerKey)), accountId)).toBe(true);
    expect(f.rows.has(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))).toBe(false);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({ coverageSourceCount: 2 });
  });
});
