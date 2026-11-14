import { describe, it, expect } from 'vitest';
import { FinancePublicationOutboxConsumer } from '../../apps/api/src/finance/publication-outbox-consumer.js';
import { financePublicationConsumerFixture as fixture } from '../fixtures/finance/publication.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { FinancePublicationJournalReader } from '../../apps/api/src/finance/publication-journal-reader.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

const pending = (f: Awaited<ReturnType<typeof fixture>>) =>
  [...f.rows.values()].find((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')!;
const consumer = (f: Awaited<ReturnType<typeof fixture>>) =>
  new FinancePublicationOutboxConsumer({ work: f.work, impact: f.impact, account: f.consumer });
async function finish(worker: FinancePublicationOutboxConsumer, id: string) {
  for (let step = 0; step < 400; step++) if ((await worker.step(id)).complete) return;
  throw new Error('Outbox did not finish bounded work');
}
async function metadata(f: Awaited<ReturnType<typeof fixture>>) {
  const unit = f.work(),
    id = experienceId(7000);
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
    key: { PK: 'FIXTURE', SK: 'metadata' },
    fingerprint: 'metadata',
    result: true,
    expiresAt: 2_000_000_000,
  });
}
describe('durable private publication outbox', () => {
  it('finishes account publication before archiving pending work and retains replayable journals', async () => {
    const f = await fixture();
    await f.change();
    const request = pending(f),
      id = request.id as string;
    await finish(consumer(f), id);
    expect(f.rows.has(f.key(request))).toBe(false);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 2,
    });
    const archive = [...f.rows.values()].find(
      (row) => row.publicationId === id && row.format === 'finance-publication-archive-v1',
    )!;
    expect(archive).toBeDefined();
    expect(Number(archive.expiresAt)).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 86400);
    const journal = [...f.rows.values()].find(
      (row) => row.PK === f.PK && row.publicationId === id,
    )!;
    expect(journal.expiresAt).toBe(archive.expiresAt);
    const reader = new FinancePublicationJournalReader({
      query: f.query,
      get: async (key) => f.work().get(key),
    });
    expect((await reader.range(f.PK, 1, 2)).entries[0]?.id).toBe(id);
    expect(f.fullEnumerations()).toBe(1);
    const household = await fixture(false, 8),
      initialEnumerations = household.fullEnumerations();
    await household.change();
    await finish(consumer(household), pending(household).id as string);
    for (const accountId of household.accountIds)
      expect(
        household.rows.get(
          household.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' }),
        ),
      ).toMatchObject({
        coverageVerified: true,
        coverageSourceCount: 2,
        coverageDependencies: { [household.PK]: 2 },
      });
    expect(household.fullEnumerations()).toBe(initialEnumerations);
    const deleted = await fixture(false, 1, true);
    await deleted.remove();
    const deletion = pending(deleted);
    const witnessKey = { PK: `FINANCE#PUBLICATION_DELETION#${experienceId(1000)}`, SK: 'CURRENT' };
    expect(deleted.rows.get(deleted.key(witnessKey))).not.toHaveProperty('expiresAt');
    await finish(consumer(deleted), String(deletion.id));
    const deletionArchive = [...deleted.rows.values()].find(
      (row) => row.format === 'finance-publication-archive-v1' && row.publicationId === deletion.id,
    )!;
    expect(deleted.rows.get(deleted.key(witnessKey))?.expiresAt).toBe(deletionArchive.expiresAt);
    expect(deleted.rows.get(deleted.key(deleted.marker))).toMatchObject({
      coverageVerified: true,
      coverageSourceCount: 1,
    });
    const replaced = await fixture(false, 1, true);
    await replaced.remove();
    const earlier = pending(replaced);
    await replaced.change(experienceId(1000));
    await replaced.remove();
    const newer = replaced.rows.get(replaced.key(witnessKey))!;
    expect(newer.publicationId).not.toBe(earlier.id);
    await finish(consumer(replaced), String(earlier.id));
    expect(replaced.rows.get(replaced.key(witnessKey))).not.toHaveProperty('expiresAt');
    await finish(consumer(replaced), String(newer.publicationId));
    expect(Number(replaced.rows.get(replaced.key(witnessKey))?.expiresAt)).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
  });
  it('discovers account dependencies for metadata-only scope changes', async () => {
    const f = await fixture();
    await metadata(f);
    const request = pending(f);
    await finish(consumer(f), request.id as string);
    expect(f.publications()).toBe(0);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { [f.PK]: 2 },
    });
  });
  it('waits for each child and consumes directory pages without completing the request early', async () => {
    const f = await fixture();
    await metadata(f);
    const request = pending(f),
      id = request.id as string;
    const ids = Array.from({ length: 7 }, (_, index) => experienceId(8000 + index));
    for (const accountId of ids)
      f.rows.set(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' }), {
        PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`,
        SK: 'CURRENT',
      });
    let busy = true;
    const called: string[] = [],
      cursors: unknown[] = [];
    const worker = new FinancePublicationOutboxConsumer({
      work: f.work,
      impact: {
        accounts: async (_scope, cursor) => {
          cursors.push(cursor);
          return cursor
            ? { accountIds: ids.slice(5) }
            : {
                accountIds: ids.slice(0, 5),
                nextKey: { PK: 'FINANCE#PROJECTION_DEPENDENCY#test', SK: `ACCOUNT#${ids[4]}` },
              };
        },
      },
      account: {
        step: async (accountId) => {
          called.push(accountId);
          return { complete: !busy };
        },
      },
    });
    for (let step = 0; step < 5; step++) await worker.step(id);
    expect(f.rows.has(f.key(request))).toBe(true);
    expect(called).toContain(ids[0]);
    busy = false;
    await finish(worker, id);
    expect(new Set(called)).toEqual(new Set(ids));
    expect(cursors.filter(Boolean)).toHaveLength(1);
  });
  it('initializes a genuinely new account and processes its first transaction without migration', async () => {
    const f = await fixture(),
      accountId = experienceId(9000),
      transactionId = experienceId(9001),
      unit = f.work();
    const accountKey = { PK: f.PK, SK: `ROW#accounts#${accountId}` };
    await unit.put({
      ...accountKey,
      collection: 'accounts',
      entryKey: accountId,
      data: { id: accountId, version: 1 },
    });
    await unit.put({ ...financeLocatorKey('accounts', accountId), storageKey: accountKey });
    const fact: FinanceFact = {
      ...f.canonical.values().next().value!,
      id: transactionId,
      accountId,
      slices: [],
      sourceVersion: 1,
    };
    f.canonical.set(transactionId, fact);
    await unit.put(f.row(fact));
    const meta = await unit.get(f.meta);
    await unit.put({ ...meta!, revision: 2 });
    await unit.commit({
      key: { PK: 'FIXTURE', SK: 'new-account' },
      fingerprint: 'new-account',
      result: true,
      expiresAt: 2_000_000_000,
    });
    const request = pending(f);
    await finish(consumer(f), request.id as string);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' })),
    ).toMatchObject({ coverageSourceCount: 1, coverageVerified: true });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageVerified: true,
    });
    expect(f.fullEnumerations()).toBe(1);
  });
  it('preserves pending work through failed and lost-response checkpoint writes and competing invocations', async () => {
    const f = await fixture();
    await f.change();
    const request = pending(f),
      id = request.id as string,
      worker = consumer(f);
    f.failAt(f.writes + 1);
    await expect(worker.step(id)).rejects.toThrow(/interrupted/i);
    expect(f.rows.has(f.key(request))).toBe(true);
    f.failAt(-1);
    f.loseResponseAt(f.writes + 1);
    await worker.step(id);
    const results = await Promise.allSettled([worker.step(id), worker.step(id)]);
    expect(results.some((value) => value.status === 'fulfilled')).toBe(true);
    await finish(worker, id);
    expect(f.rows.has(f.key(request))).toBe(false);
  });
  it('rejects malformed checkpoints without erasing the pending manifest', async () => {
    const f = await fixture();
    await f.change();
    const request = pending(f),
      id = request.id as string,
      worker = consumer(f);
    await worker.step(id);
    const job = [...f.rows.values()].find((row) => row.PK === `FINANCE#PUBLICATION_JOB#${id}`)!;
    (job.data as Record<string, unknown>).version = 99;
    const writes = f.writes;
    await expect(worker.step(id)).rejects.toThrow(/checkpoint|format/i);
    expect(f.writes).toBe(writes);
    expect(f.rows.has(f.key(request))).toBe(true);
  });
  it('does not create a zero baseline for an existing account whose trusted proof is missing', async () => {
    const f = await fixture();
    await f.change();
    const request = pending(f);
    f.rows.delete(f.key(f.marker));
    await expect(finish(consumer(f), request.id as string)).rejects.toThrow(
      /baseline|existing|creation/i,
    );
    expect(f.rows.has(f.key(request))).toBe(true);
    expect(f.rows.has(f.key(f.marker))).toBe(false);
  });
  it('replays an archived completion without reopening work or extending its retention', async () => {
    const f = await fixture();
    await f.change();
    const id = pending(f).id as string,
      worker = consumer(f);
    await finish(worker, id);
    const before = f.writes;
    expect(await worker.step(id)).toEqual({ complete: true });
    expect(f.writes).toBe(before);
  });
  it('excludes automatic consumption during a trusted full verification and resumes after that explicit repair', async () => {
    const f = await fixture();
    await metadata(f);
    const request = pending(f),
      worker = consumer(f);
    await f.verifier.step(f.accountId, { restart: true });
    await expect(finish(worker, request.id as string)).rejects.toThrow(/baseline|coverage/i);
    expect(f.rows.has(f.key(request))).toBe(true);
    for (let step = 0; step < 10; step++) if ((await f.verifier.step(f.accountId)).complete) break;
    await finish(worker, request.id as string);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });
});
