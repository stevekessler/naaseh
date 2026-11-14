import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import {
  describeFinanceCanonicalChange,
  financePublicationJournalRecords,
} from '../../apps/api/src/finance/publication-change-journal.js';
import {
  loadFinanceDeletedTransaction,
  financePublicationDeletionKey,
} from '../../apps/api/src/finance/publication-deletion-proof.js';
import { parseFinancePublicationManifest } from '../../apps/api/src/finance/publication-journal-reader.js';
const id = experienceId(1000),
  accountId = experienceId(100);
function fixture() {
  const f = financePersistenceFixture();
  const PK = 'FINANCE#SCOPE#OWNER#owner';
  const source = {
    PK,
    SK: `ROW#transactions#${id}`,
    collection: 'transactions',
    entryKey: id,
    data: { id, accountId, version: 2, description: 'Private financial text', amountMinor: -100 },
  };
  const meta = { PK, SK: 'META' };
  f.rows.set(f.key(source), source);
  f.rows.set(f.key(meta), { ...meta, revision: 2 });
  const work = () => new FinanceUnitOfWork(f.persistence, 'table');
  const remove = async (revision = 3) => {
    const unit = work();
    await unit.delete(source);
    await unit.put({ ...meta, revision });
    return unit.commit({
      key: { PK: 'FIXTURE', SK: `delete#${revision}` },
      fingerprint: `delete#${revision}`,
      result: true,
      expiresAt: 2_000_000_000,
    });
  };
  return { ...f, PK, source, meta, work, remove };
}
describe('canonical physical deletion evidence', () => {
  it('records and verifies user removal atomically without financial text or transaction expiry', async () => {
    const f = fixture();
    await f.remove();
    const witness = f.rows.get(f.key(financePublicationDeletionKey(id)));
    expect(witness).toMatchObject({
      transactionId: id,
      accountIds: [accountId],
      beforeVersion: 2,
      scopePK: f.PK,
    });
    expect(JSON.stringify(witness)).not.toContain(f.source.data.description);
    expect(witness).not.toHaveProperty('expiresAt');
    expect(await loadFinanceDeletedTransaction(id, f.work())).toMatchObject({
      transactionId: id,
      beforeVersion: 2,
      scopePK: f.PK,
    });
    const manifest = [...f.rows.values()].find((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')!;
    expect(parseFinancePublicationManifest(manifest, String(manifest.id)).changes[0]).toMatchObject(
      { removed: true },
    );
    expect(f.rows.has(f.key(f.source))).toBe(false);
  });
  it('does not infer physical deletion from an update with a missing version or a version-only tombstone', () => {
    const f = fixture();
    for (const data of [
      { id, accountId },
      { ...f.source.data, status: 'tombstone', version: 3 },
    ]) {
      const change = describeFinanceCanonicalChange(f.source, f.source, { ...f.source, data })!;
      const rows = financePublicationJournalRecords(
        [change],
        [{ PK: f.PK, beforeRevision: 2, afterRevision: 3 }],
      );
      expect(change).not.toHaveProperty('removed');
      expect(rows.some((row) => row.PK === financePublicationDeletionKey(id).PK)).toBe(false);
    }
  });
  it('does not leave a deletion witness when the same transaction is relocated in one commit', () => {
    const f = fixture(),
      nextPK = 'FINANCE#SCOPE#GROUP#group';
    const changes = [
      describeFinanceCanonicalChange(f.source, f.source)!,
      describeFinanceCanonicalChange({ ...f.source, PK: nextPK }, undefined, {
        ...f.source,
        PK: nextPK,
      })!,
    ];
    const rows = financePublicationJournalRecords(changes, [
      { PK: f.PK, beforeRevision: 2, afterRevision: 3 },
      { PK: nextPK, beforeRevision: 0, afterRevision: 1 },
    ]);
    expect(rows.some((row) => row.PK === financePublicationDeletionKey(id).PK)).toBe(false);
  });
  it('leaves source and proof unchanged on interruption and replays a successful deletion once', async () => {
    const f = fixture();
    f.failAt(1);
    await expect(f.remove()).rejects.toThrow(/interrupted/);
    expect(f.rows.has(f.key(f.source))).toBe(true);
    expect(f.rows.has(f.key(financePublicationDeletionKey(id)))).toBe(false);
    f.failAt(-1);
    await f.remove();
    const snapshot = JSON.stringify([...f.rows]);
    await f.remove();
    expect(JSON.stringify([...f.rows])).toBe(snapshot);
    const recreate = f.work();
    await recreate.put({ ...f.source, data: { ...f.source.data, version: 3 } });
    await recreate.put({ ...f.meta, revision: 4 });
    await recreate.commit({
      key: { PK: 'FIXTURE', SK: 'recreate' },
      fingerprint: 'recreate',
      result: true,
      expiresAt: 2_000_000_000,
    });
    await f.remove(5);
    expect(await loadFinanceDeletedTransaction(id, f.work())).toMatchObject({
      beforeVersion: 3,
      revision: 5,
    });
  });
  it('excludes a recreated canonical source even if an old deletion proof remains', async () => {
    const f = fixture();
    await f.remove();
    f.rows.set(f.key(f.source), f.source);
    expect(await loadFinanceDeletedTransaction(id, f.work())).toBeUndefined();
    f.rows.delete(f.key(f.source));
    const legacy = {
      ...f.source,
      SK: `ROW#transactions#${createHash('sha256').update(id).digest('hex')}`,
    };
    f.rows.set(f.key(legacy), legacy);
    expect(await loadFinanceDeletedTransaction(id, f.work())).toBeUndefined();
    f.rows.delete(f.key(legacy));
    const locator = financeLocatorKey('transactions', id);
    f.rows.set(f.key(locator), {
      ...locator,
      storageKey: { PK: 'FINANCE#SCOPE#GROUP#other', SK: f.source.SK },
    });
    expect(await loadFinanceDeletedTransaction(id, f.work())).toBeUndefined();
  });
  it('fails closed on forged proof or a journal transition that does not match its manifest', async () => {
    const f = fixture();
    expect(await loadFinanceDeletedTransaction(id, f.work())).toBeUndefined();
    await f.remove();
    const key = financePublicationDeletionKey(id),
      saved = f.rows.get(f.key(key))!;
    f.rows.set(f.key(key), { ...saved, accountIds: [experienceId(101)] });
    await expect(loadFinanceDeletedTransaction(id, f.work())).rejects.toThrow(/proof|deletion/i);
    f.rows.set(f.key(key), saved);
    const journalKey = { PK: f.PK, SK: 'PUBLICATION_CHANGE#0000000000000003' };
    f.rows.set(f.key(journalKey), {
      ...f.rows.get(f.key(journalKey)),
      ...journalKey,
      beforeRevision: 0,
    });
    await expect(loadFinanceDeletedTransaction(id, f.work())).rejects.toThrow(/journal|deletion/i);
  });
});
