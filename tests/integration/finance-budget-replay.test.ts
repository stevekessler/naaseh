import { describe, expect, it, vi } from 'vitest';
import { dispatchFinanceReplay } from '../../apps/api/src/finance/sync-replay.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const budgetId = '01J00000000000000000000001',
  mutationId = '01J00000000000000000000002';
const event = {
  rawPath: '/api/v1/sync/push',
  headers: {
    origin: 'http://localhost:5173',
    'x-csrf-token': 'csrf',
    'x-finance-unlock': 'opaque',
    'x-finance-tab': 'tab',
  },
  requestContext: {
    requestId: 'replay-test',
    http: { method: 'POST' },
    authorizer: {
      lambda: { userId: 'owner', role: 'user', csrfToken: 'csrf', sessionHash: 'a'.repeat(64) },
    },
  },
} as unknown as APIGatewayProxyEventV2;
const mutation = {
  id: mutationId,
  entityId: budgetId,
  entityType: 'financeBudget',
  operation: 'update',
  baseVersion: 1,
  payload: { name: 'Saved name' },
  createdAt: '2026-11-07T00:00:00Z',
  attempts: 0,
} as const;
describe('protected budget replay adapter', () => {
  it('uses the existing protected edit path with the original principal, intent key and base version, without echoing Finance values', async () => {
    const call = vi
      .fn<
        (incoming: APIGatewayProxyEventV2) => Promise<import('aws-lambda').APIGatewayProxyResultV2>
      >()
      .mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ id: budgetId, version: 2, name: 'Private reply' }),
      });
    expect(await dispatchFinanceReplay(event, mutation, call)).toEqual({
      mutationId,
      status: 'applied',
      version: 2,
    });
    const forwarded = call.mock.calls[0]![0]!;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/budgets/${budgetId}`);
    expect(forwarded.requestContext.authorizer).toEqual(event.requestContext.authorizer);
    expect(forwarded.requestContext.http.method).toBe('PATCH');
    expect(forwarded.headers).toMatchObject({
      'x-finance-unlock': 'opaque',
      'x-finance-tab': 'tab',
      'x-csrf-token': 'csrf',
      'x-finance-sync-replay': 'budget-edit-v1',
    });
    expect(forwarded.headers['idempotency-key']).toContain(mutationId);
    expect(JSON.parse(forwarded.body!)).toEqual({ name: 'Saved name', expectedVersion: 1 });
    call.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'x-finance-sync-replayed': '1' },
      body: JSON.stringify({ id: budgetId, version: 2 }),
    });
    expect((await dispatchFinanceReplay(event, mutation, call)).status).toBe('alreadyApplied');
  });
  it('routes strict queued activity changes through the matching protected command', async () => {
    const invoke = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ id: budgetId, version: 2 }),
    });
    const result = await dispatchFinanceReplay(
      event,
      { ...mutation, payload: { activity: 'inactive', expectedVersion: 1 } },
      invoke,
    );
    expect(result).toEqual({ mutationId, status: 'applied', version: 2 });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/budgets/${budgetId}/deactivate`);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers['x-finance-sync-replay']).toBe('budget-activity-v1');
    expect(JSON.parse(forwarded.body!)).toEqual({ expectedVersion: 1 });
  });
  it('holds unsupported operations and rejects invalid or mismatched edit intent before dispatch', async () => {
    const call = vi.fn();
    expect(
      (
        await dispatchFinanceReplay(
          event,
          { ...mutation, entityType: 'financeUpcomingExpense' },
          call,
        )
      ).status,
    ).toBe('retry');
    for (const payload of [
      { name: '' },
      { ownerId: 'other', name: 'Do not smuggle ownership' },
      { expectedVersion: 7, name: 'Mismatch' },
    ])
      expect((await dispatchFinanceReplay(event, { ...mutation, payload }, call)).status).toBe(
        'rejected',
      );
    expect(call).not.toHaveBeenCalled();
  });
  it('maps errors to safe outcomes and never copies private response bodies into conflicts', async () => {
    for (const [statusCode, status] of [
      [400, 'rejected'],
      [401, 'retry'],
      [403, 'retry'],
      [404, 'conflict'],
      [409, 'conflict'],
      [429, 'retry'],
      [503, 'retry'],
    ] as const) {
      const result = await dispatchFinanceReplay(event, mutation, async () => ({
        statusCode,
        body: JSON.stringify({ title: 'Private source details', amountMinor: 999 }),
      }));
      expect(result.status).toBe(status);
      expect(JSON.stringify(result)).not.toMatch(/Private source|999/);
    }
  });
  it('never acknowledges an invalid success response, another entity or a non-advanced version', async () => {
    for (const body of [
      'invalid json',
      JSON.stringify({ id: 'other', version: 2 }),
      JSON.stringify({ id: budgetId, version: 1 }),
    ])
      expect(
        (await dispatchFinanceReplay(event, mutation, async () => ({ statusCode: 200, body })))
          .status,
      ).toBe('retry');
  });
});

const transactionId = '01J00000000000000000000007';
const accountId = '01J00000000000000000000008';
const manualTransactionCreate = {
  ...mutation,
  entityId: transactionId,
  entityType: 'financeTransaction' as const,
  operation: 'create' as const,
  baseVersion: 0,
  payload: {
    id: transactionId,
    accountId,
    expectedAccountVersion: 3,
    amountMinor: -1250,
    transactedAt: '2026-11-07T12:00:00.000Z',
    description: 'Queued manual purchase',
    paymentType: 'card' as const,
  },
};
describe('protected manual transaction creation replay', () => {
  it('retains the queued transaction ID and forwards only validated account-scoped input', async () => {
    const invoke = vi.fn().mockResolvedValue({
      statusCode: 201,
      headers: {},
      body: JSON.stringify({ id: transactionId, version: 1, description: 'Private reply' }),
    });
    await expect(dispatchFinanceReplay(event, manualTransactionCreate, invoke)).resolves.toEqual({
      mutationId,
      status: 'applied',
      version: 1,
    });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/accounts/${accountId}/transactions`);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers).toMatchObject({
      'x-finance-sync-replay': 'manual-transaction-create-v1',
      'x-finance-unlock': 'opaque',
      'x-csrf-token': 'csrf',
    });
    expect(forwarded.headers['idempotency-key']).toContain(mutationId);
    expect(JSON.parse(forwarded.body!)).toEqual({
      id: transactionId,
      expectedAccountVersion: 3,
      amountMinor: -1250,
      transactedAt: '2026-11-07T12:00:00.000Z',
      description: 'Queued manual purchase',
      pending: false,
      paymentType: 'card',
    });
  });

  it('rejects mismatched identity, account, version and unknown fields before dispatch', async () => {
    const invoke = vi.fn();
    for (const value of [
      { ...manualTransactionCreate, entityId: budgetId },
      {
        ...manualTransactionCreate,
        payload: { ...manualTransactionCreate.payload, id: budgetId },
      },
      {
        ...manualTransactionCreate,
        payload: { ...manualTransactionCreate.payload, accountId: 'not-an-account' },
      },
      { ...manualTransactionCreate, baseVersion: 1 },
      {
        ...manualTransactionCreate,
        payload: { ...manualTransactionCreate.payload, ownerId: 'smuggled' },
      },
    ])
      expect((await dispatchFinanceReplay(event, value, invoke)).status).toBe('rejected');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires the exact creation acknowledgement and safely identifies an applied retry', async () => {
    for (const body of [
      { id: budgetId, version: 1 },
      { id: transactionId, version: 0 },
      { id: transactionId, version: 2 },
    ])
      expect(
        (
          await dispatchFinanceReplay(event, manualTransactionCreate, async () => ({
            statusCode: 201,
            body: JSON.stringify(body),
          }))
        ).status,
      ).toBe('retry');
    await expect(
      dispatchFinanceReplay(event, manualTransactionCreate, async () => ({
        statusCode: 201,
        headers: { 'x-finance-sync-replayed': '1' },
        body: JSON.stringify({ id: transactionId, version: 1 }),
      })),
    ).resolves.toEqual({ mutationId, status: 'alreadyApplied', version: 1 });
  });
});

const budgetCreate = {
  ...mutation,
  operation: 'create' as const,
  baseVersion: 0,
  payload: {
    id: budgetId,
    groupId: '01J00000000000000000000003',
    name: 'Queued household budget',
    budgetDate: '2026-12-01',
    startDate: '2026-12-01',
    status: 'draft',
    version: 1,
  },
};
describe('protected budget creation replay', () => {
  it('retains the queued budget ID and forwards only validated business input', async () => {
    const invoke = vi.fn().mockResolvedValue({
      statusCode: 201,
      headers: {},
      body: JSON.stringify({ id: budgetId, version: 1, name: 'Private reply' }),
    });
    expect(await dispatchFinanceReplay(event, budgetCreate, invoke)).toEqual({
      mutationId,
      status: 'applied',
      version: 1,
    });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/budgets/${budgetId}`);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers).toMatchObject({
      'x-finance-sync-replay': 'budget-create-v1',
      'x-finance-unlock': 'opaque',
      'x-csrf-token': 'csrf',
    });
    expect(forwarded.headers['idempotency-key']).toContain(mutationId);
    expect(JSON.parse(forwarded.body!)).toEqual({
      groupId: budgetCreate.payload.groupId,
      name: budgetCreate.payload.name,
      budgetDate: budgetCreate.payload.budgetDate,
      startDate: budgetCreate.payload.startDate,
      status: 'draft',
    });
  });

  it('rejects mismatched creation identity, version, archived state and unknown fields', async () => {
    const invoke = vi.fn();
    for (const payload of [
      { ...budgetCreate.payload, id: mutationId },
      { ...budgetCreate.payload, version: 2 },
      { ...budgetCreate.payload, status: 'archived' },
      { ...budgetCreate.payload, ownerId: 'smuggled' },
    ])
      expect(
        (await dispatchFinanceReplay(event, { ...budgetCreate, payload }, invoke)).status,
      ).toBe('rejected');
    expect(
      (await dispatchFinanceReplay(event, { ...budgetCreate, baseVersion: 1 }, invoke)).status,
    ).toBe('rejected');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires an exact creation acknowledgement and maps a saved retry safely', async () => {
    for (const body of [
      { id: mutationId, version: 1 },
      { id: budgetId, version: 0 },
      { id: budgetId, version: 2 },
    ])
      expect(
        (
          await dispatchFinanceReplay(event, budgetCreate, async () => ({
            statusCode: 201,
            body: JSON.stringify(body),
          }))
        ).status,
      ).toBe('retry');
    expect(
      await dispatchFinanceReplay(event, budgetCreate, async () => ({
        statusCode: 201,
        headers: { 'x-finance-sync-replayed': '1' },
        body: JSON.stringify({ id: budgetId, version: 1 }),
      })),
    ).toEqual({ mutationId, status: 'alreadyApplied', version: 1 });
  });
});

const accountLink = {
  ...mutation,
  entityId: '01J00000000000000000000005',
  entityType: 'financeBudgetAccountLink' as const,
  operation: 'create' as const,
  baseVersion: 0,
  payload: {
    id: '01J00000000000000000000005',
    budgetId,
    accountId: '01J00000000000000000000006',
    expectedBudgetVersion: 1,
    audience: { type: 'group', groupId: 'smuggled' },
    createdBy: 'pending',
    status: 'active',
    version: 1,
  },
};
describe('protected budget account-link creation replay', () => {
  it('uses a stable link ID and forwards only the canonical link command', async () => {
    const safeMutation = {
      ...accountLink,
      payload: { ...accountLink.payload },
    };
    delete (safeMutation.payload as Record<string, unknown>).audience;
    const invoke = vi.fn().mockResolvedValue({
      statusCode: 201,
      body: JSON.stringify({ id: safeMutation.entityId, version: 1 }),
    });
    await expect(dispatchFinanceReplay(event, safeMutation, invoke)).resolves.toEqual({
      mutationId,
      status: 'applied',
      version: 1,
    });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/budgets/${budgetId}/accounts`);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers['x-finance-sync-replay']).toBe('budget-account-link-create-v1');
    expect(JSON.parse(forwarded.body!)).toEqual({
      id: safeMutation.entityId,
      accountId: safeMutation.payload.accountId,
      expectedBudgetVersion: 1,
    });
  });

  it('rejects unknown fields, mismatched identity and invalid local metadata before dispatch', async () => {
    const invoke = vi.fn();
    for (const payload of [
      accountLink.payload,
      { ...accountLink.payload, audience: undefined, id: budgetId },
      { ...accountLink.payload, audience: undefined, version: 2 },
      { ...accountLink.payload, audience: undefined, expectedBudgetVersion: 0 },
    ])
      expect((await dispatchFinanceReplay(event, { ...accountLink, payload }, invoke)).status).toBe(
        'rejected',
      );
    expect(invoke).not.toHaveBeenCalled();
  });
});

const budgetItem = {
  ...mutation,
  entityId: '01J00000000000000000000007',
  entityType: 'financeBudgetItem' as const,
  operation: 'create' as const,
  baseVersion: 0,
  payload: {
    id: '01J00000000000000000000007',
    budgetId,
    expectedBudgetVersion: 2,
    description: 'Queued rent',
    financeCategoryId: '01J00000000000000000000004',
    plannedAmountMinor: -125000,
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: ['01J00000000000000000000006'],
    creatorId: 'pending',
    status: 'active',
    version: 1,
  },
};
describe('protected budget-item creation replay', () => {
  it('uses a stable item ID and forwards only the canonical item command', async () => {
    const invoke = vi.fn().mockResolvedValue({
      statusCode: 201,
      body: JSON.stringify({ id: budgetItem.entityId, version: 1 }),
    });
    await expect(dispatchFinanceReplay(event, budgetItem, invoke)).resolves.toEqual({
      mutationId,
      status: 'applied',
      version: 1,
    });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/budgets/${budgetId}/items`);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers['x-finance-sync-replay']).toBe('budget-item-create-v1');
    expect(JSON.parse(forwarded.body!)).toEqual({
      id: budgetItem.entityId,
      expectedBudgetVersion: 2,
      description: 'Queued rent',
      financeCategoryId: budgetItem.payload.financeCategoryId,
      plannedAmountMinor: -125000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: budgetItem.payload.relatedAccountIds,
    });
  });

  it('rejects unknown fields, mismatched identity and invalid local metadata before dispatch', async () => {
    const invoke = vi.fn();
    for (const payload of [
      { ...budgetItem.payload, id: budgetId },
      { ...budgetItem.payload, version: 2 },
      { ...budgetItem.payload, expectedBudgetVersion: 0 },
      { ...budgetItem.payload, scope: { type: 'owner', ownerId: 'smuggled' } },
    ])
      expect((await dispatchFinanceReplay(event, { ...budgetItem, payload }, invoke)).status).toBe(
        'rejected',
      );
    expect(invoke).not.toHaveBeenCalled();
  });
});

const reusable = {
  ...mutation,
  entityType: 'financeReusableItem' as const,
  operation: 'create' as const,
  baseVersion: 0,
  payload: {
    id: budgetId,
    groupId: '01J00000000000000000000003',
    description: 'Queued bill',
    financeCategoryId: '01J00000000000000000000004',
    plannedAmountMinor: -1000,
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: [],
    applicableDate: '2026-12-01',
    creatorId: 'pending',
    status: 'active',
    version: 1,
  },
};
describe('protected reusable-item creation replay', () => {
  it('retains the queued entity ID and actor while forwarding only validated business input', async () => {
    const invoke = vi
      .fn<
        (incoming: APIGatewayProxyEventV2) => Promise<import('aws-lambda').APIGatewayProxyResultV2>
      >()
      .mockResolvedValue({
        statusCode: 201,
        headers: {},
        body: JSON.stringify({ id: budgetId, version: 1, description: 'Private reply' }),
      });
    expect(await dispatchFinanceReplay(event, reusable, invoke)).toEqual({
      mutationId,
      status: 'applied',
      version: 1,
    });
    const forwarded = invoke.mock.calls[0]![0] as APIGatewayProxyEventV2;
    expect(forwarded.rawPath).toBe(`/api/v1/finance/reusable-items/${budgetId}`);
    expect(forwarded.requestContext.authorizer).toEqual(event.requestContext.authorizer);
    expect(forwarded.requestContext.http.method).toBe('POST');
    expect(forwarded.headers).toMatchObject({
      'x-finance-sync-replay': 'reusable-create-v1',
      'x-finance-unlock': 'opaque',
      'x-csrf-token': 'csrf',
    });
    expect(forwarded.headers['idempotency-key']).toContain(mutationId);
    const body = JSON.parse(forwarded.body!);
    expect(body.description).toBe('Queued bill');
    for (const key of ['id', 'creatorId', 'version', 'status'])
      expect(body).not.toHaveProperty(key);
    expect(
      JSON.stringify(
        await dispatchFinanceReplay(event, reusable, async () => ({
          statusCode: 201,
          headers: { 'x-finance-sync-replayed': '1' },
          body: JSON.stringify({ id: budgetId, version: 1 }),
        })),
      ),
    ).toContain('alreadyApplied');
  });
  it('rejects mismatched local identity/metadata and unknown fields, and keeps unsupported updates pending', async () => {
    const invoke = vi.fn();
    for (const payload of [
      { ...reusable.payload, id: mutationId },
      { ...reusable.payload, version: 2 },
      { ...reusable.payload, status: 'archived' },
      { ...reusable.payload, creatorId: 'someone-else' },
      { ...reusable.payload, ownerId: 'smuggled' },
      { ...reusable.payload, plannedAmountMinor: 0 },
    ])
      expect((await dispatchFinanceReplay(event, { ...reusable, payload }, invoke)).status).toBe(
        'rejected',
      );
    expect(
      (await dispatchFinanceReplay(event, { ...reusable, baseVersion: 1 }, invoke)).status,
    ).toBe('rejected');
    expect(
      (await dispatchFinanceReplay(event, { ...reusable, operation: 'update' }, invoke)).status,
    ).toBe('retry');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('never acknowledges another entity or a non-creation result, or discloses private conflicts', async () => {
    for (const body of [
      { id: mutationId, version: 1 },
      { id: budgetId, version: 0 },
      { id: budgetId, version: 2 },
    ])
      expect(
        (
          await dispatchFinanceReplay(event, reusable, async () => ({
            statusCode: 201,
            body: JSON.stringify(body),
          }))
        ).status,
      ).toBe('retry');
    const result = await dispatchFinanceReplay(event, reusable, async () => ({
      statusCode: 409,
      body: JSON.stringify({ description: 'Private conflicting bill', plannedAmountMinor: 19999 }),
    }));
    expect(result.status).toBe('conflict');
    expect(JSON.stringify(result)).not.toMatch(/Private conflicting|19999/);
  });
});
