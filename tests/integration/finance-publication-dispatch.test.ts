import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { dispatchFinanceInvocation } from '../../apps/api/src/finance/query-worker.js';
import { executeFinancePublicationWorker } from '../../apps/api/src/finance/publication-worker.js';
import { requestFinancePublication } from '../../apps/api/src/finance/publication-dispatch.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

const id = 'a'.repeat(64);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('trusted publication dispatch and invocation', () => {
  it('keeps an HTTP body mimicking publication work behind normal HTTP authorization', async () => {
    const http = vi.fn(async () => ({ statusCode: 403 })),
      worker = vi.fn(),
      publication = vi.fn();
    const event = {
      version: '2.0',
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({ kind: 'naaseh.finance.publication-worker', publicationId: id }),
    };
    expect(await dispatchFinanceInvocation(event, { http, worker, publication })).toEqual({
      statusCode: 403,
    });
    expect(publication).not.toHaveBeenCalled();
  });
  it('accepts only an identifier-only native publication envelope and rejects bypass fields', async () => {
    const http = vi.fn(),
      worker = vi.fn(),
      publication = vi.fn();
    const envelope = { kind: 'naaseh.finance.publication-worker', publicationId: id };
    await dispatchFinanceInvocation(envelope, { http, worker, publication });
    expect(publication).toHaveBeenCalledWith({ publicationId: id });
    for (const extra of [
      { unlocked: true },
      { accountId: 'other' },
      { filters: {} },
      { publicationId: 'bad' },
    ])
      await expect(
        dispatchFinanceInvocation({ ...envelope, ...extra }, { http, worker, publication }),
      ).rejects.toThrow(/invalid/i);
    expect(publication).toHaveBeenCalledTimes(1);
  });
  it('stops at completion without dispatching another invocation', async () => {
    const step = vi.fn(async () => ({ complete: true })),
      continuation = vi.fn(),
      emit = vi.fn();
    await executeFinancePublicationWorker({ publicationId: id }, { step, continuation, emit });
    expect(step).toHaveBeenCalledTimes(1);
    expect(continuation).not.toHaveBeenCalled();
  });
  it('performs at most five durable actions before one identifier-only continuation', async () => {
    const step = vi.fn(async () => ({ complete: false })),
      continuation = vi.fn(),
      emit = vi.fn();
    await executeFinancePublicationWorker({ publicationId: id }, { step, continuation, emit });
    expect(step).toHaveBeenCalledTimes(5);
    expect(continuation).toHaveBeenCalledExactlyOnceWith(id);
  });
  it('preserves Lambda time headroom by continuing before beginning another action', async () => {
    const step = vi.fn(),
      continuation = vi.fn(),
      emit = vi.fn();
    await executeFinancePublicationWorker(
      { publicationId: id },
      { step, continuation, emit, remainingMs: () => 4000 },
    );
    expect(step).not.toHaveBeenCalled();
    expect(continuation).toHaveBeenCalledExactlyOnceWith(id);
  });
  it('retains pending work on failure and emits safe metadata without copying error content', async () => {
    const step = vi.fn(async () => {
        throw new Error('private synthetic financial detail');
      }),
      continuation = vi.fn(),
      emit = vi.fn();
    await expect(
      executeFinancePublicationWorker({ publicationId: id }, { step, continuation, emit }),
    ).rejects.toThrow('Finance publication worker failed');
    expect(continuation).not.toHaveBeenCalled();
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private synthetic');
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ operation: 'projection', outcome: 'failed' });
  });
  it('publishes only the durable identifier to the configured default bus', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', 'default');
    const send = vi
      .spyOn(EventBridgeClient.prototype, 'send')
      .mockResolvedValue({ FailedEntryCount: 0, Entries: [{ EventId: 'event' }] } as never);
    expect(await requestFinancePublication([id])).toBe(true);
    const input = (send.mock.calls[0]?.[0] as { input: unknown }).input;
    expect(input).toEqual({
      Entries: [
        {
          EventBusName: 'default',
          Source: 'naaseh.finance.publication',
          DetailType: 'FinancePublicationRequested',
          Detail: JSON.stringify({ publicationId: id }),
        },
      ],
    });
  });
  it('treats partial event delivery and transport failures as durable pending work', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', 'default');
    const send = vi
      .spyOn(EventBridgeClient.prototype, 'send')
      .mockResolvedValue({
        FailedEntryCount: 1,
        Entries: [{ ErrorCode: 'ThrottlingException' }],
      } as never);
    expect(await requestFinancePublication([id])).toBe(false);
    send.mockRejectedValueOnce(new Error('synthetic transport outage'));
    expect(await requestFinancePublication([id])).toBe(false);
  });
  it('does not make cloud calls when local dispatch is unconfigured', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const send = vi.spyOn(EventBridgeClient.prototype, 'send');
    expect(await requestFinancePublication([id])).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('dispatches only after the canonical write commits and never changes its successful result on delivery failure', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', 'default');
    const f = financePersistenceFixture(),
      PK = 'FINANCE#SCOPE#OWNER#u';
    const send = vi.spyOn(EventBridgeClient.prototype, 'send').mockImplementation(async () => {
      expect(f.writes).toBeGreaterThan(0);
      expect([...f.rows.values()].some((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')).toBe(
        true,
      );
      throw new Error('Synthetic event delivery failure');
    });
    const unit = new FinanceUnitOfWork(f.persistence, 'table');
    await unit.put({
      PK,
      SK: 'ROW#accounts#a',
      collection: 'accounts',
      entryKey: 'a',
      data: { id: 'a', version: 1 },
    });
    await unit.put({ PK, SK: 'META', revision: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(
      await unit.commit({
        key: { PK, SK: 'RECEIPT#1' },
        fingerprint: 'one',
        result: { saved: true },
        expiresAt: 2_000_000_000,
      }),
    ).toEqual({ saved: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
