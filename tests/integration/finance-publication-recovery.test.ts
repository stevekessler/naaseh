import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancePublicationRecovery } from '../../apps/api/src/finance/publication-recovery.js';
import { financePublicationJournalRecords } from '../../apps/api/src/finance/publication-change-journal.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { dispatchFinanceInvocation } from '../../apps/api/src/finance/query-worker.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';

const state = { PK: 'FINANCE#PUBLICATION_RECOVERY', SK: 'CURRENT' };
function fixture(count = 6) {
  const f = financePersistenceFixture(),
    records = [] as Array<Record<string, unknown> & { PK: string; SK: string }>;
  for (let index = 0; index < count; index++) {
    const rows = financePublicationJournalRecords(
      [
        {
          scopePK: 'FINANCE#SCOPE#OWNER#u',
          keyHash: String(index).padStart(64, '0'),
          collection: 'transactions',
          sourceId: experienceId(1000 + index),
          accountIds: [experienceId(100)],
          afterVersion: 1,
        },
      ],
      [{ PK: 'FINANCE#SCOPE#OWNER#u', beforeRevision: index, afterRevision: index + 1 }],
    );
    records.push(rows[0]!);
    f.rows.set(f.key(rows[0]!), rows[0]!);
  }
  records.sort((a, b) => (a.SK < b.SK ? -1 : 1));
  const dispatch = vi.fn<(id: string) => Promise<void>>(async () => undefined),
    emit = vi.fn(),
    calls: unknown[] = [];
  let badPage = false;
  const recovery = new FinancePublicationRecovery({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    dispatch,
    emit,
    readPage: async (cursor) => {
      calls.push(cursor);
      const rows = records.filter((row) => !cursor || row.SK > cursor.SK),
        page = rows.slice(0, 5),
        last = page.at(-1);
      return {
        rows: page,
        ...(last && rows.length > page.length
          ? { nextKey: { PK: badPage ? 'WRONG' : last.PK, SK: last.SK } }
          : {}),
      };
    },
  });
  return {
    ...f,
    get writes() {
      return f.writes;
    },
    records,
    recovery,
    dispatch,
    emit,
    calls,
    badPage() {
      badPage = true;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
describe('bounded missed-publication recovery', () => {
  it('polls an empty queue without writes or continuation requests', async () => {
    const f = fixture(0);
    expect(await f.recovery.step()).toEqual({ selected: 0, dispatched: 0, failed: 0 });
    expect(f.writes).toBe(0);
    const send = vi.spyOn(dynamodb, 'send').mockResolvedValue({ Items: [] } as never);
    const native = new FinancePublicationRecovery({
      work: () => new FinanceUnitOfWork(f.persistence, 'table'),
      dispatch: f.dispatch,
      emit: f.emit,
    });
    expect(await native.step()).toEqual({ selected: 0, dispatched: 0, failed: 0 });
    expect((send.mock.calls[0]?.[0] as { input: unknown }).input).toMatchObject({
      ConsistentRead: true,
      Limit: 5,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': 'FINANCE#PUBLICATION_OUTBOX', ':prefix': 'PENDING#' },
    });
    expect(f.writes).toBe(0);
    expect(f.dispatch).not.toHaveBeenCalled();
    f.rows.set(f.key(state), { ...state, data: { version: 1, revision: 42 } });
    expect(await f.recovery.step()).toEqual({ selected: 0, dispatched: 0, failed: 0 });
    expect(f.writes).toBe(0);
  });
  it('dispatches at most five identifiers and resumes then wraps without deleting pending work', async () => {
    const f = fixture();
    expect(await f.recovery.step()).toEqual({ selected: 5, dispatched: 5, failed: 0 });
    const saved = f.rows.get(f.key(state))!;
    expect(saved).toMatchObject({
      data: { version: 1, cursor: { PK: f.records[4]!.PK, SK: f.records[4]!.SK } },
    });
    expect(await f.recovery.step()).toEqual({ selected: 1, dispatched: 1, failed: 0 });
    expect(f.calls[1]).toEqual({ PK: f.records[4]!.PK, SK: f.records[4]!.SK });
    expect(f.rows.get(f.key(state))?.data).toEqual({ version: 1, revision: 2 });
    expect((await f.recovery.step()).selected).toBe(5);
    expect(f.rows.get(f.key(state))?.data).toMatchObject({ revision: 3 });
    expect((await f.recovery.step()).selected).toBe(1);
    expect(
      [...f.rows.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(6);
  });
  it('isolates corrupt manifests and failed deliveries while preserving all pending records', async () => {
    const f = fixture(3);
    f.records[0]!.format = 'future-format';
    f.records[0]!.privateMemo = 'private synthetic financial text';
    f.dispatch.mockRejectedValueOnce(new Error('synthetic outage'));
    expect(await f.recovery.step()).toEqual({ selected: 3, dispatched: 1, failed: 2 });
    expect(JSON.stringify(f.emit.mock.calls)).not.toContain('private synthetic');
    expect(
      [...f.rows.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(3);
  });
  it('rejects unknown checkpoint formats and cross-partition page cursors before dispatch', async () => {
    const f = fixture();
    for (const data of [{ version: 99 }, undefined, null]) {
      f.rows.set(f.key(state), { ...state, data });
      await expect(f.recovery.step()).rejects.toThrow(/checkpoint|format/i);
    }
    expect(f.calls).toHaveLength(0);
    f.rows.delete(f.key(state));
    f.badPage();
    await expect(f.recovery.step()).rejects.toThrow(/cursor|page/i);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.writes).toBe(0);
  });
  it('recovers lost responses and competing recovery cursors without losing the next page', async () => {
    const f = fixture();
    f.loseResponseAt(1);
    const results = await Promise.all([f.recovery.step(), f.recovery.step()]);
    expect(results.every((result) => result.selected === 5)).toBe(true);
    expect(await f.recovery.step()).toEqual({ selected: 1, dispatched: 1, failed: 0 });
    expect(f.dispatch.mock.calls.some(([id]) => id === f.records[5]!.id)).toBe(true);
  });
  it('accepts a minimal native recovery request while HTTP lookalikes and cursor fields cannot select it', async () => {
    const http = vi.fn(async () => ({ statusCode: 403 })),
      worker = vi.fn(),
      publication = vi.fn(),
      recovery = vi.fn();
    const envelope = { kind: 'naaseh.finance.publication-recovery' };
    await dispatchFinanceInvocation(
      {
        version: '2.0',
        requestContext: { http: { method: 'POST' } },
        body: JSON.stringify(envelope),
      },
      { http, worker, publication, recovery },
    );
    expect(recovery).not.toHaveBeenCalled();
    await dispatchFinanceInvocation(envelope, { http, worker, publication, recovery });
    expect(recovery).toHaveBeenCalledTimes(1);
    await expect(
      dispatchFinanceInvocation(
        { ...envelope, cursor: 'client-input' },
        { http, worker, publication, recovery },
      ),
    ).rejects.toThrow(/invalid/i);
    const signal = {
      kind: 'naaseh.finance.publication-signal',
      source: 'naaseh.finance.publication',
      detail: { publicationId: 'a'.repeat(64) },
    };
    await dispatchFinanceInvocation(signal, { http, worker, publication, recovery });
    expect(publication).toHaveBeenCalledWith({ publicationId: 'a'.repeat(64) });
    await dispatchFinanceInvocation(
      { ...signal, source: 'aws.events', detail: {} },
      { http, worker, publication, recovery },
    );
    expect(recovery).toHaveBeenCalledTimes(2);
    await dispatchFinanceInvocation(
      {
        version: '2.0',
        requestContext: { http: { method: 'POST' } },
        body: JSON.stringify({ ...signal, source: 'aws.events', detail: {} }),
      },
      { http, worker, publication, recovery },
    );
    expect(recovery).toHaveBeenCalledTimes(2);
    await expect(
      dispatchFinanceInvocation(
        { ...signal, source: 'aws.events', detail: { publicationId: 'client-input' } },
        { http, worker, publication, recovery },
      ),
    ).rejects.toThrow(/invalid/i);
  });
  it('signals stalled work using bounded metadata while still attempting recovery', async () => {
    const f = fixture(1);
    f.records[0]!.createdAt = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(await f.recovery.step()).toEqual({ selected: 1, dispatched: 1, failed: 0 });
    expect(
      f.emit.mock.calls.some(
        ([event]) => event.operation === 'projection' && event.errorCategory === 'stalled',
      ),
    ).toBe(true);
  });
});
