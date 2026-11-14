import { FinanceSyncSourceGuard } from '../../apps/api/src/finance/sync-source-guard.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { describe, expect, it, vi } from 'vitest';
import { handler } from '../../apps/api/src/sync/handler.js';
const httpMocks = vi.hoisted(() => ({
  guard: vi.fn(),
  pull: vi.fn(),
  memberships: vi.fn(async () => []),
  bootstrap: vi.fn(),
  bootstrapDependencies: vi.fn(() => ({ marker: 'bounded-reader' })),
}));
vi.mock('../../apps/api/src/finance/finance-unlock-guard.js', async (original) => ({
  ...(await original<object>()),
  createFinanceUnlockGuard: () => httpMocks.guard,
}));
vi.mock('../../apps/api/src/groups/group-repository.js', () => ({
  listUserMemberships: httpMocks.memberships,
}));
vi.mock('../../apps/api/src/sync/change-feed-repository.js', async (original) => ({
  ...(await original<object>()),
  pullAudience: httpMocks.pull,
}));
vi.mock('../../apps/api/src/finance/bootstrap.js', () => ({
  readFinanceBootstrapPage: httpMocks.bootstrap,
  financeBootstrapDynamoDependencies: httpMocks.bootstrapDependencies,
}));
import { SafeApiError } from '../../apps/api/src/shared/http.js';
import {
  createFinanceSyncHandler,
  applyFinanceSourceChecks,
  pullFinanceDeliveryLanes,
} from '../../apps/api/src/sync/handlers.js';

const changes = [
  {
    sequence: 1,
    entityId: 'task-one',
    entityType: 'task',
    operation: 'upsert',
    payload: { label: 'Ordinary task' },
  },
  {
    sequence: 2,
    entityId: 'private-one',
    entityType: 'financeTransaction',
    operation: 'upsert',
    payload: { amountMinor: 100 },
  },
  {
    sequence: 3,
    entityId: 'task-two',
    entityType: 'task',
    operation: 'upsert',
    payload: { label: 'Ordinary task two' },
  },
] as any[];
const read = async (_audience: string, after: number) => changes.filter((c) => c.sequence > after);
const feeds: [string, string][] = [['owner', 'OWNER#u1']];
describe('independent protected Finance synchronization delivery', () => {
  it('serves an opt-in bootstrap page without reading or acknowledging ordinary feeds', async () => {
    const previousSecret = process.env.CURSOR_SIGNING_SECRET;
    process.env.CURSOR_SIGNING_SECRET = 'bootstrap-route-test-secret-'.repeat(3);
    httpMocks.guard.mockReset().mockResolvedValue({ requirePin: false });
    httpMocks.pull.mockReset();
    httpMocks.memberships.mockResolvedValue([
      { userId: 'u1', groupId: 'group-1', status: 'active', role: 'member', version: 1 },
    ]);
    httpMocks.bootstrap.mockResolvedValue({
      records: [],
      frontier: { public: 7, owner: 11, 'group:group-1': 13 },
      complete: false,
      nextCursor: 'fb1.next.page.tag',
    });
    const proof = vi
      .spyOn(
        (await import('../../apps/api/src/finance/cache-proof.js')).FinanceCacheProofService
          .prototype,
        'issue',
      )
      .mockResolvedValue('fc1.nonce.body.tag');
    try {
      const result = (await handler(
        {
          rawPath: '/api/v1/sync/pull',
          headers: {},
          body: JSON.stringify({
            contractVersion: 8,
            financeCacheProtocol: 1,
            financeBootstrapProtocol: 1,
          }),
          requestContext: {
            requestId: 'finance-bootstrap',
            http: { method: 'POST' },
            authorizer: { lambda: { userId: 'u1', role: 'user' } },
          },
        } as never,
        {} as never,
        () => undefined,
      )) as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        financeState: 'ready',
        financeBootstrap: { complete: false, nextCursor: 'fb1.next.page.tag' },
        financeCache: { status: 'current' },
      });
      expect(httpMocks.bootstrap).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          partitions: ['FINANCE#CATALOG', 'FINANCE#SCOPE#OWNER#u1', 'FINANCE#SCOPE#GROUP#group-1'],
        }),
      );
      expect(httpMocks.pull).not.toHaveBeenCalled();
    } finally {
      proof.mockRestore();
      httpMocks.memberships.mockResolvedValue([]);
      if (previousSecret === undefined) delete process.env.CURSOR_SIGNING_SECRET;
      else process.env.CURSOR_SIGNING_SECRET = previousSecret;
    }
  });

  it.each(['financeFutureRecord', 'financeReceipt'])(
    'holds unsupported %s events without stalling ordinary progress',
    async (entityType) => {
      const lanes = await pullFinanceDeliveryLanes({
        feeds,
        cursor: {},
        financeCursor: { owner: 0 },
        contractVersion: 8,
        requirePin: false,
        unlocked: true,
        read: async () => [changes[0], { ...changes[1], entityType }, changes[2]],
      });
      const guard = {
        supports: (type: string) => type === 'financeTransaction',
        canDeliver: vi.fn(async () => false),
        assertCurrent: vi.fn(),
      };
      const result = await applyFinanceSourceChecks(lanes, guard, { owner: 0 });
      expect(result.financeState).toBe('upgrade-required');
      expect(result.financeCursor).toEqual({ owner: 0 });
      expect(result.financeChanges).toEqual([]);
      expect(result.changes.map((change) => change.entityId)).toEqual(['task-one', 'task-two']);
      expect(result.cursor).toEqual({ owner: 3 });
      expect(guard.canDeliver).not.toHaveBeenCalled();
    },
  );

  it('advances ordinary tasks while locked without acknowledging hidden Finance changes', async () => {
    const result = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      financeCursor: {},
      contractVersion: 8,
      requirePin: true,
      unlocked: false,
      read,
    });
    expect(result.changes.map((c) => c.entityId)).toEqual(['task-one', 'task-two']);
    expect(result.cursor).toEqual({ owner: 3 });
    expect(result.financeCursor).toEqual({});
    expect(result.financeChanges).toEqual([]);
    expect(result.financeState).toBe('locked');
    const unlocked = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      financeCursor: { owner: 1 },
      contractVersion: 8,
      requirePin: true,
      unlocked: true,
      read,
    });
    const revoked = await applyFinanceSourceChecks(
      unlocked,
      {
        canDeliver: async () => true,
        assertCurrent: async () => {
          throw new SafeApiError(
            409,
            'finance_sync_sources_changed',
            'Retry synchronization.',
            'authorization',
          );
        },
      },
      { owner: 1 },
    );
    expect(revoked.changes.map((change) => change.entityId)).toEqual(['task-one', 'task-two']);
    expect(revoked.cursor).toEqual({ owner: 3 });
    expect(revoked.financeCursor).toEqual({ owner: 1 });
    expect(revoked.financeChanges).toEqual([]);
    expect(revoked.financeState).toBe('locked');
    expect(JSON.stringify(revoked)).not.toContain('amountMinor');
  });
  it('explicitly withholds Finance even when unprotected without reading its separate page', async () => {
    const reader = vi.fn(async (audience: string, after: number) => [
      ...(await read(audience, after)),
      {
        sequence: 4,
        entityId: 'future-private',
        entityType: 'financeFutureRecord',
        operation: 'upsert',
        payload: { secret: 'future-secret' },
      },
    ]);
    const result = await pullFinanceDeliveryLanes({
      feeds,
      cursor: { owner: 1 },
      financeCursor: {},
      contractVersion: 8,
      requirePin: false,
      unlocked: true,
      deliverFinance: false,
      read: reader,
    });
    expect(result.changes.map((row) => row.entityId)).toEqual(['task-two']);
    expect(result.cursor).toEqual({ owner: 4 });
    expect(result.financeCursor).toEqual({});
    expect(result.financeChanges).toEqual([]);
    expect(reader).toHaveBeenCalledExactlyOnceWith('OWNER#u1', 1, 200);
  });
  it('keeps ordinary HTTP sync available without consulting Finance security when delivery is withheld', async () => {
    httpMocks.guard.mockReset().mockRejectedValue(new Error('Finance dependency unavailable'));
    httpMocks.pull.mockImplementation(async (audience: string) =>
      audience === 'OWNER#u1'
        ? [
            { ...changes[0], operation: 'tombstone', payload: undefined },
            changes[1],
            {
              ...changes[1],
              sequence: 3,
              entityType: 'financeFutureRecord',
              entityId: 'future-private',
            },
          ]
        : [],
    );
    const result = (await handler(
      {
        rawPath: '/api/v1/sync/pull',
        headers: {},
        body: JSON.stringify({
          contractVersion: 8,
          deliverFinance: false,
          financeCursor: { owner: 0 },
        }),
        requestContext: {
          requestId: 'hold-test',
          http: { method: 'POST' },
          authorizer: { lambda: { userId: 'u1', role: 'user' } },
        },
      } as never,
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.changes.map((row: { entityId: string }) => row.entityId)).toEqual(['task-one']);
    expect(body.cursor.owner).toBe(3);
    expect(body.financeCursor).toEqual({ owner: 0 });
    expect(body.financeChanges).toEqual([]);
    expect(result.body).not.toContain('private-one');
    expect(result.body).not.toContain('future-private');
    expect(result.body).not.toContain('amountMinor');
    expect(httpMocks.guard).not.toHaveBeenCalled();
  });
  it('preserves ordinary HTTP progress and the previous Finance cursor when a grant expires during delivery', async () => {
    httpMocks.guard
      .mockReset()
      .mockResolvedValueOnce({ requirePin: true, securityRevision: 1, sessionEpoch: 1 })
      .mockRejectedValue(
        new SafeApiError(403, 'finance_locked', 'Unlock Finance', 'authorization'),
      );
    httpMocks.pull.mockImplementation(async (audience: string, after: number) =>
      audience === 'OWNER#u1'
        ? [{ ...changes[0], operation: 'tombstone', payload: undefined }, changes[1]].filter(
            (row) => row.sequence > after,
          )
        : [],
    );
    const source = vi.spyOn(FinanceSyncSourceGuard.prototype, 'canDeliver').mockResolvedValue(true);
    const current = vi.spyOn(FinanceSyncSourceGuard.prototype, 'assertCurrent').mockResolvedValue();
    try {
      const result = (await handler(
        {
          rawPath: '/api/v1/sync/pull',
          headers: {},
          body: JSON.stringify({ contractVersion: 8, financeCursor: { owner: 1 } }),
          requestContext: {
            requestId: 'late-finance-lock',
            http: { method: 'POST' },
            authorizer: { lambda: { userId: 'u1', role: 'user' } },
          },
        } as never,
        {} as never,
        () => undefined,
      )) as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.changes.map((row: { entityId: string }) => row.entityId)).toEqual(['task-one']);
      expect(body.cursor.owner).toBe(2);
      expect(body.financeState).toBe('locked');
      expect(body.financeCursor).toEqual({ owner: 1 });
      expect(body.financeChanges).toEqual([]);
      expect(result.body).not.toContain('private-one');
      expect(source).toHaveBeenCalledOnce();
    } finally {
      source.mockRestore();
      current.mockRestore();
    }
  });

  it('issues cache evidence only behind the current Finance gate and preserves ordinary progress on invalid evidence', async () => {
    const catalogue = vi
      .spyOn(FinanceUnitOfWork.prototype, 'get')
      .mockImplementation(async (key) => {
        expect(key).toEqual({ PK: 'FINANCE#CATALOG', SK: 'META' });
        return undefined;
      });
    const previousSecret = process.env.CURSOR_SIGNING_SECRET;
    process.env.CURSOR_SIGNING_SECRET = 'cache-boundary-test-secret-'.repeat(3);
    httpMocks.guard.mockReset().mockResolvedValue({ requirePin: false });
    httpMocks.pull.mockImplementation(async (audience: string) =>
      audience === 'OWNER#u1'
        ? [{ ...changes[0], operation: 'tombstone', payload: undefined }]
        : [],
    );
    const request = async (extra = {}) =>
      handler(
        {
          rawPath: '/api/v1/sync/pull',
          headers: {},
          body: JSON.stringify({ contractVersion: 8, financeCacheProtocol: 1, ...extra }),
          requestContext: {
            requestId: 'cache-boundary',
            http: { method: 'POST' },
            authorizer: { lambda: { userId: 'u1', role: 'user' } },
          },
        } as never,
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    try {
      const response = await request();
      expect(response.statusCode).toBe(200);
      const first = JSON.parse(response.body);
      expect(first.financeCache.status).toBe('current');
      expect(first.financeCache.proof).toMatch(/^fc1[.]/);
      expect(httpMocks.guard.mock.calls.length).toBeGreaterThanOrEqual(3);
      httpMocks.pull.mockImplementation(async (audience: string) =>
        audience === 'OWNER#u1'
          ? [{ ...changes[0], operation: 'tombstone', payload: undefined }, changes[1]]
          : [],
      );
      const source = vi
        .spyOn(FinanceSyncSourceGuard.prototype, 'canDeliver')
        .mockRejectedValue(new Error('A cache-only check must not hydrate sources'));
      try {
        httpMocks.pull.mockClear();
        httpMocks.memberships.mockClear();
        const checked = await request({
          cursor: { owner: 11 },
          financeCursor: { owner: 7 },
          financeCacheOnly: true,
          financeCacheProof: [first.financeCache.proof, first.financeCache.proof],
        });
        expect(checked.statusCode).toBe(200);
        const check = JSON.parse(checked.body);
        expect(check.financeCache.status).toBe('current');
        expect(check.financeChanges).toEqual([]);
        expect(check.financeCursor).toEqual({ owner: 7 });
        expect(check.cursor).toEqual({ owner: 11 });
        expect(check.changes).toEqual([]);
        expect(httpMocks.pull).not.toHaveBeenCalled();
        expect(httpMocks.memberships).not.toHaveBeenCalled();
        expect(checked.body).not.toContain('private-one');
        expect(source).not.toHaveBeenCalled();
      } finally {
        source.mockRestore();
      }
      httpMocks.pull.mockImplementation(async (audience: string) =>
        audience === 'OWNER#u1'
          ? [{ ...changes[0], operation: 'tombstone', payload: undefined }]
          : [],
      );
      expect((await request({ financeCacheOnly: true, financeCacheProof: [] })).statusCode).toBe(
        400,
      );
      expect(
        (
          await request({
            financeCacheOnly: true,
            financeCacheProof: Array(65).fill(first.financeCache.proof),
          })
        ).statusCode,
      ).toBe(400);
      const invalid = await request({ financeCacheProof: 'fc1.invalid' });
      expect(invalid.statusCode).toBe(200);
      const held = JSON.parse(invalid.body);
      expect(held.financeCache).toEqual({ status: 'refresh-required' });
      expect(held.changes.map((row: { entityId: string }) => row.entityId)).toEqual(['task-one']);
      expect(held.financeChanges).toEqual([]);
      expect(held.financeCursor).toEqual({});
      expect(held.cursor.owner).toBe(1);
    } finally {
      catalogue.mockRestore();
      if (previousSecret === undefined) delete process.env.CURSOR_SIGNING_SECRET;
      else process.env.CURSOR_SIGNING_SECRET = previousSecret;
    }
  });
  it('does not issue or validate cache proofs while Finance delivery is held or the grant is locked', async () => {
    httpMocks.guard
      .mockReset()
      .mockRejectedValue(
        new SafeApiError(403, 'finance_locked', 'Unlock Finance', 'authorization'),
      );
    httpMocks.pull.mockResolvedValue([]);
    for (const deliverFinance of [true, false]) {
      const response = (await handler(
        {
          rawPath: '/api/v1/sync/pull',
          headers: {},
          body: JSON.stringify({
            contractVersion: 8,
            financeCacheProtocol: 1,
            deliverFinance,
            financeCacheProof: 'not-a-grant',
          }),
          requestContext: {
            requestId: 'cache-locked',
            http: { method: 'POST' },
            authorizer: { lambda: { userId: 'u1', role: 'user' } },
          },
        } as never,
        {} as never,
        () => undefined,
      )) as { statusCode: number; body: string };
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).financeCache).toEqual({ status: 'locked' });
      expect(JSON.parse(response.body).financeChanges).toEqual([]);
    }
    expect(httpMocks.guard).toHaveBeenCalledOnce();
  });
  it('replays protected changes from their own checkpoint after ordinary sync already advanced', async () => {
    const result = await pullFinanceDeliveryLanes({
      feeds,
      cursor: { owner: 3 },
      financeCursor: {},
      contractVersion: 8,
      requirePin: true,
      unlocked: true,
      read,
    });
    expect(result.changes).toEqual([]);
    expect(result.financeChanges.map((c) => c.entityId)).toEqual(['private-one']);
    expect(result.financeCursor).toEqual({ owner: 3 });
    expect(result.financeState).toBe('ready');
  });
  it('preserves legacy unprotected delivery but withholds protected Finance from older clients', async () => {
    const modernRead = async (audience: string, after: number) =>
      [
        ...(await read(audience, after)),
        {
          sequence: 4,
          entityId: 'refund-v2',
          entityType: 'financeRefundRelationship',
          operation: 'upsert',
          payload: { privateReference: 'v2-only' },
        },
      ].filter((change) => change.sequence > after) as any[];
    const legacy = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      contractVersion: 7,
      requirePin: false,
      unlocked: false,
      read: modernRead,
    });
    expect(legacy.changes).toHaveLength(3);
    expect(JSON.stringify(legacy.changes)).not.toContain('v2-only');
    const modern = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      financeCursor: {},
      contractVersion: 8,
      requirePin: false,
      unlocked: false,
      read: modernRead,
    });
    expect(modern.financeChanges.map((row) => row.entityId)).toContain('refund-v2');
    const protectedLegacy = await pullFinanceDeliveryLanes({
      feeds,
      cursor: {},
      contractVersion: 7,
      requirePin: true,
      unlocked: true,
      read,
    });
    expect(protectedLegacy.changes.map((c) => c.entityId)).toEqual(['task-one', 'task-two']);
    expect(protectedLegacy.financeState).toBe('upgrade-required');
    expect(protectedLegacy.financeCursor).toEqual({});
    let allowed = false;
    let dispatched = 0;
    const replay = createFinanceSyncHandler(
      async () => {
        dispatched++;
        allowed = false; // Protection changed during dispatch/receipt lookup.
        return {
          mutationId: 'm1',
          status: 'alreadyApplied',
          entity: { amountMinor: 100 },
        } as never;
      },
      async () => {
        if (!allowed) throw new Error('Unlock Finance');
      },
    );
    const mutation = { entityType: 'financeTransaction' } as never;
    await expect(replay('u1', mutation)).rejects.toThrow(/unlock/i);
    expect(dispatched).toBe(0);
    allowed = true;
    await expect(replay('u1', mutation)).rejects.toThrow(/unlock/i);
    expect(dispatched).toBe(1);
  });
});

it('reports a protected continuation from its own full page when ordinary sync is already ahead', async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    ...changes[1],
    sequence: index + 1,
    entityId: `synthetic-finance-${index}`,
  }));
  const result = await pullFinanceDeliveryLanes({
    feeds,
    cursor: { owner: 400 },
    financeCursor: {},
    contractVersion: 8,
    requirePin: false,
    unlocked: true,
    read: async (_audience, after) => (after === 0 ? rows : []),
  });
  expect(result.financeCursor).toEqual({ owner: 200 });
  expect(result.cursor).toEqual({ owner: 400 });
  expect(result.financeHasMore).toBe(true);
});
it('withholds continuation hints along with locked or unsupported Finance while tasks progress', async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    ...changes[index % 3]!,
    sequence: index + 1,
    entityId: `synthetic-${index}`,
  }));
  const input = {
    feeds,
    cursor: {},
    financeCursor: {},
    contractVersion: 8,
    requirePin: true,
    unlocked: false,
    read: async () => rows,
  };
  const locked = await pullFinanceDeliveryLanes(input);
  expect(locked.financeHasMore).toBe(false);
  expect(locked.financeCursor).toEqual({});
  expect(locked.cursor).toEqual({ owner: 200 });
  const ready = await pullFinanceDeliveryLanes({ ...input, unlocked: true });
  expect(ready.financeHasMore).toBe(true);
  const unsupported = await applyFinanceSourceChecks(
    ready,
    { supports: () => false, canDeliver: async () => true, assertCurrent: async () => undefined },
    {},
  );
  expect(unsupported.financeHasMore).toBe(false);
  expect(unsupported.financeCursor).toEqual({});
  expect(unsupported.cursor).toEqual({ owner: 200 });
});
