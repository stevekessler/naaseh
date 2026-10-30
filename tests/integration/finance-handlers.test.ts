import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import {
  FinanceRouteRegistry,
  registerUserStory1FinanceRoutes,
} from '../../apps/api/src/finance/handlers.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  createFinancialAccount,
  createFinancialTransaction,
  createMerchant,
  createUserFinanceCategory,
  replaceTransactionAllocations,
} from '@naaseh/domain';

const actor = { id: 'owner-1', role: 'user' as const, active: true, groupMemberships: [] };
const request = (
  method: string,
  path: string,
  body?: unknown,
  pathParameters?: Record<string, string>,
) =>
  ({
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf',
      'idempotency-key': `mutation-${method}-${path}`,
    },
    requestContext: {
      requestId: 'request-1',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '',
      timeEpoch: 0,
      authorizer: { lambda: { userId: actor.id, csrfToken: 'csrf' } },
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(pathParameters ? { pathParameters } : {}),
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;

const parsed = (response: Awaited<ReturnType<ReturnType<typeof createFinanceHandler>>>) =>
  JSON.parse(('body' in response ? response.body : undefined) ?? '{}') as Record<string, unknown>;

describe('Finance US1 HTTP routes', () => {
  it('routes account, balance, transaction, CSV, deletion, connection, and job operations', async () => {
    const repository = new FinanceMemoryRepository();
    const invocations: unknown[] = [];
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => actor,
      deletionSigningSecret: 'test-secret',
      allowedSimplefinHosts: ['bridge.simplefin.org'],
      kms: { send: async () => ({ CiphertextBlob: new Uint8Array([1, 2, 3]) }) },
      fetcher: (async () =>
        new Response('https://user:pass@bridge.simplefin.org/simplefin')) as typeof fetch,
      lambda: {
        send: async (command: unknown) => {
          invocations.push(command);
          return {};
        },
      },
      importFunctionName: 'finance-import',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    const handler = createFinanceHandler(registry);
    const createdResponse = await handler(
      request('POST', '/api/v1/finance/accounts', {
        scope: { type: 'owner', ownerId: actor.id },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 10000,
        balanceAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(createdResponse.statusCode).toBe(201);
    const account = parsed(createdResponse);
    const accountId = String(account.id);
    const balanceResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/accounts/{accountId}/balances',
        {
          expectedAccountVersion: 1,
          balanceMinor: 12000,
          effectiveAt: '2026-01-02T00:00:00.000Z',
        },
        { accountId },
      ),
    );
    expect(balanceResponse.statusCode).toBe(201);
    const transactionResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/accounts/{accountId}/transactions',
        {
          amountMinor: -500,
          transactedAt: '2026-01-02T12:00:00.000Z',
          description: 'Groceries',
          pending: false,
        },
        { accountId },
      ),
    );
    expect(transactionResponse.statusCode).toBe(201);
    const listResponse = await handler(
      request('GET', '/api/v1/finance/accounts/{accountId}/transactions', undefined, { accountId }),
    );
    expect(parsed(listResponse).items).toHaveLength(1);
    const transactionId = String(parsed(transactionResponse).id);
    const categoryResponse = await handler(
      request('POST', '/api/v1/finance/categories', {
        name: 'Dining',
      }),
    );
    expect(categoryResponse.statusCode).toBe(201);
    const categoryId = String(parsed(categoryResponse).id);
    const allocationResponse = await handler(
      request(
        'PUT',
        '/api/v1/finance/transactions/{transactionId}/allocations',
        {
          expectedVersion: 1,
          allocations: [
            { id: '01J00000000000000000000031', amountMinor: -500, financeCategoryId: categoryId },
          ],
        },
        { transactionId },
      ),
    );
    expect(allocationResponse.statusCode).toBe(200);
    const merchantResponse = await handler(
      request('POST', '/api/v1/finance/merchants', {
        name: 'Fixture Market',
        city: 'Denver',
        region: 'CO',
      }),
    );
    expect(merchantResponse.statusCode).toBe(201);
    const merchantId = String(parsed(merchantResponse).id);
    const associationResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/transactions/{transactionId}/merchant',
        {
          merchantId,
          expectedVersion: 2,
        },
        { transactionId },
      ),
    );
    expect(associationResponse.statusCode).toBe(200);
    const activityResponse = await handler(
      request('GET', '/api/v1/finance/merchants/{merchantId}', undefined, { merchantId }),
    );
    expect(parsed(activityResponse).transactions).toHaveLength(1);
    const csvResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/accounts/{accountId}/csv-imports',
        {
          batchId: '01J00000000000000000000002',
          fileDigest: 'a'.repeat(64),
          mapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            dateFormat: 'YYYY-MM-DD',
            amountMapping: { mode: 'signed', amountColumn: 'Amount' },
          },
          duplicateDecisionDigest: 'b'.repeat(64),
          duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
          chunkIndex: 0,
          finalChunk: true,
          rows: [
            {
              ordinal: 1,
              amountMinor: -250,
              transactedAt: '2026-01-03T00:00:00.000Z',
              description: 'CSV fixture',
              duplicateDisposition: 'not-suspected',
            },
          ],
        },
        { accountId },
      ),
    );
    expect(csvResponse.statusCode).toBe(201);
    expect(parsed(csvResponse).status).toBe('succeeded');

    const claimResponse = await handler(
      request('POST', '/api/v1/finance/connections/simplefin/claim', {
        setupToken: Buffer.from('https://bridge.simplefin.org/claim').toString('base64'),
        scope: { type: 'owner', ownerId: actor.id },
      }),
    );
    expect(claimResponse.statusCode).toBe(201);
    expect(claimResponse.body).not.toContain('AQID');
    const connectionId = String(parsed(claimResponse).id);
    const refreshResponse = await handler(
      request('POST', '/api/v1/finance/connections/{connectionId}/refresh', undefined, {
        connectionId,
      }),
    );
    expect(refreshResponse.statusCode).toBe(202);
    expect(invocations).toHaveLength(1);
    const jobId = String(parsed(refreshResponse).id);
    expect(
      (await handler(request('GET', '/api/v1/finance/import-jobs/{jobId}', undefined, { jobId })))
        .statusCode,
    ).toBe(200);

    const previewResponse = await handler(
      request(
        'GET',
        '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
        undefined,
        { recordType: 'transaction', recordId: transactionId },
      ),
    );
    expect(previewResponse.statusCode).toBe(200);
    const preview = parsed(previewResponse);
    const deletionResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/records/{recordType}/{recordId}/deletion',
        {
          expectedVersion: preview.expectedVersion,
          confirmationToken: preview.confirmationToken,
        },
        { recordType: 'transaction', recordId: String(preview.recordId) },
      ),
    );
    expect(deletionResponse.statusCode).toBe(200);
    expect(parsed(deletionResponse).categoriesPreserved).toBe(true);
    expect(repository.categories.has(categoryId)).toBe(true);

    const categoryPreviewResponse = await handler(
      request(
        'GET',
        '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
        undefined,
        { recordType: 'category', recordId: categoryId },
      ),
    );
    expect(categoryPreviewResponse.statusCode).toBe(200);
    const categoryPreview = parsed(categoryPreviewResponse);
    expect(categoryPreview.outcome).toBe('archive');
    const categoryDeletionResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/records/{recordType}/{recordId}/deletion',
        {
          expectedVersion: categoryPreview.expectedVersion,
          confirmationToken: categoryPreview.confirmationToken,
        },
        { recordType: 'category', recordId: categoryId },
      ),
    );
    expect(categoryDeletionResponse.statusCode).toBe(200);
    expect(repository.categories.get(categoryId)).toMatchObject({ status: 'archived' });
  });

  it('routes budget create, account link, item, update, read, and archive operations', async () => {
    const repository = new FinanceMemoryRepository();
    const groupId = '01J00000000000000000000901';
    const accountId = '01J00000000000000000000902';
    const categoryId = '01J00000000000000000000903';
    const manager = { ...actor, groupMemberships: [{ groupId, role: 'manager' as const }] };
    repository.accounts.set(
      accountId,
      createFinancialAccount({
        id: accountId,
        scope: { type: 'group', groupId },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-04-01T00:00:00.000Z',
      }),
    );
    repository.categories.set(
      categoryId,
      createUserFinanceCategory({
        id: categoryId,
        name: 'Groceries',
        creatorId: manager.id,
      }),
    );
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => manager,
      deletionSigningSecret: 'test-secret',
      allowedSimplefinHosts: ['bridge.simplefin.org'],
      now: () => new Date('2026-04-01T00:00:00.000Z'),
    });
    const handler = createFinanceHandler(registry);
    const createdResponse = await handler(
      request('POST', '/api/v1/finance/budgets', {
        groupId,
        name: 'April plan',
        budgetDate: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    );
    expect(createdResponse.statusCode).toBe(201);
    const budgetId = String(parsed(createdResponse).id);
    expect(
      (
        await handler(
          request(
            'POST',
            '/api/v1/finance/budgets/{budgetId}/accounts',
            {
              accountId,
              expectedBudgetVersion: 1,
            },
            { budgetId },
          ),
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await handler(
          request(
            'POST',
            '/api/v1/finance/budgets/{budgetId}/items',
            {
              expectedBudgetVersion: 2,
              description: 'Groceries',
              financeCategoryId: categoryId,
              plannedAmountMinor: -10_000,
              currency: 'USD',
              currencyExponent: 2,
              relatedAccountIds: [accountId],
            },
            { budgetId },
          ),
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await handler(
          request(
            'PATCH',
            '/api/v1/finance/budgets/{budgetId}',
            {
              expectedVersion: 3,
              name: 'April household plan',
            },
            { budgetId },
          ),
        )
      ).statusCode,
    ).toBe(200);
    const detail = parsed(
      await handler(request('GET', '/api/v1/finance/budgets/{budgetId}', undefined, { budgetId })),
    );
    expect(detail).toMatchObject({
      name: 'April household plan',
      totalsComplete: true,
      version: 4,
    });
    expect(detail.items).toHaveLength(1);

    const previewResponse = await handler(
      request(
        'GET',
        '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
        undefined,
        { recordType: 'budget', recordId: budgetId },
      ),
    );
    const preview = parsed(previewResponse);
    expect(preview).toMatchObject({
      outcome: 'archive',
      dependentCounts: { accountLinks: 1, items: 1 },
    });
    expect(
      (
        await handler(
          request(
            'POST',
            '/api/v1/finance/records/{recordType}/{recordId}/deletion',
            {
              expectedVersion: preview.expectedVersion,
              confirmationToken: preview.confirmationToken,
            },
            { recordType: 'budget', recordId: budgetId },
          ),
        )
      ).statusCode,
    ).toBe(200);
    expect(repository.budgets.get(budgetId)).toMatchObject({ status: 'archived' });
    expect([...repository.budgetItems.values()][0]).toMatchObject({ status: 'archived' });
  });

  it('routes reusable offers, occurrence copies, match decisions, and tombstone previews', async () => {
    const repository = new FinanceMemoryRepository();
    const groupId = '01J00000000000000000000911';
    const accountId = '01J00000000000000000000912';
    const categoryId = '01J00000000000000000000913';
    const merchantId = '01J00000000000000000000914';
    const transactionId = '01J00000000000000000000915';
    const manager = { ...actor, groupMemberships: [{ groupId, role: 'manager' as const }] };
    repository.accounts.set(
      accountId,
      createFinancialAccount({
        id: accountId,
        scope: { type: 'group', groupId },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2027-09-01T00:00:00.000Z',
      }),
    );
    repository.categories.set(
      categoryId,
      createUserFinanceCategory({ id: categoryId, name: 'Utilities', creatorId: manager.id }),
    );
    repository.merchants.set(
      merchantId,
      createMerchant({
        id: merchantId,
        name: 'Mobile Fixture',
        source: 'manual',
        creatorId: manager.id,
      }),
    );
    repository.transactions.push(
      createFinancialTransaction({
        id: transactionId,
        accountId,
        origin: 'manual',
        amountMinor: -50_000,
        currency: 'USD',
        transactedAt: '2027-09-15T12:00:00.000Z',
        description: 'Mobile service',
        merchantId,
        pending: false,
        connectedAccount: false,
      }),
    );
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => manager,
      deletionSigningSecret: 'test-secret',
      allowedSimplefinHosts: ['bridge.simplefin.org'],
      now: () => new Date('2027-09-01T00:00:00.000Z'),
    });
    const handler = createFinanceHandler(registry);
    const budgetResponse = await handler(
      request('POST', '/api/v1/finance/budgets', {
        groupId,
        name: 'September plan',
        budgetDate: '2027-09-01',
        startDate: '2027-09-01',
        endDate: '2027-09-30',
      }),
    );
    const budgetId = String(parsed(budgetResponse).id);
    await handler(
      request(
        'POST',
        '/api/v1/finance/budgets/{budgetId}/accounts',
        {
          accountId,
          expectedBudgetVersion: 1,
        },
        { budgetId },
      ),
    );
    const reusableResponse = await handler(
      request('POST', '/api/v1/finance/reusable-items', {
        groupId,
        description: 'Mobile service',
        merchantId,
        financeCategoryId: categoryId,
        plannedAmountMinor: -50_000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [accountId],
        applicableDate: '2027-09-15',
      }),
    );
    expect(reusableResponse.statusCode).toBe(201);
    const reusableId = String(parsed(reusableResponse).id);
    const offerResponse = await handler(
      request('GET', '/api/v1/finance/budgets/{budgetId}/reusable-offers', undefined, { budgetId }),
    );
    expect(parsed(offerResponse).items).toHaveLength(1);
    const copyResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/budgets/{budgetId}/reusable-items/{reusableItemId}/copy',
        {
          occurrenceDate: '2027-09-15',
          expectedBudgetVersion: 2,
        },
        { budgetId, reusableItemId: reusableId },
      ),
    );
    expect(copyResponse.statusCode).toBe(201);
    const evaluation = await handler(
      request(
        'POST',
        '/api/v1/finance/transactions/{transactionId}/matches/evaluate',
        {},
        { transactionId },
      ),
    );
    const matches = parsed(evaluation).items as Array<Record<string, unknown>>;
    expect(matches).toMatchObject([{ status: 'accepted', kind: 'exact' }]);
    const matchId = String(matches[0]?.id);
    const undoResponse = await handler(
      request(
        'POST',
        '/api/v1/finance/matches/{matchId}/decision',
        {
          decision: 'undo',
          expectedVersion: 1,
          expectedTransactionVersion: 2,
        },
        { matchId },
      ),
    );
    expect(parsed(undoResponse)).toMatchObject({ status: 'undone', version: 2 });
    const preview = parsed(
      await handler(
        request(
          'GET',
          '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
          undefined,
          { recordType: 'match', recordId: matchId },
        ),
      ),
    );
    expect(preview.outcome).toBe('tombstone');
  });

  it('routes online budget reconciliation with immutable history and sanitized conflicts', async () => {
    const repository = new FinanceMemoryRepository();
    const groupId = '01J00000000000000000000951';
    const budgetId = '01J00000000000000000000952';
    const accountId = '01J00000000000000000000953';
    const itemId = '01J00000000000000000000954';
    const categoryId = '01J00000000000000000000955';
    const transactionId = '01J00000000000000000000956';
    const manager = { ...actor, groupMemberships: [{ groupId, role: 'manager' as const }] };
    repository.accounts.set(
      accountId,
      createFinancialAccount({
        id: accountId,
        scope: { type: 'group', groupId },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2027-09-01T00:00:00.000Z',
      }),
    );
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => manager,
      deletionSigningSecret: 'test-secret',
      allowedSimplefinHosts: ['bridge.simplefin.org'],
      now: () => new Date('2027-09-30T23:00:00.000Z'),
    });
    const handler = createFinanceHandler(registry);
    repository.budgets.set(budgetId, {
      id: budgetId,
      groupId,
      name: 'September',
      budgetDate: '2027-09-01',
      startDate: '2027-09-01',
      endDate: '2027-09-30',
      status: 'active',
      version: 1,
    });
    await handler(
      request(
        'POST',
        '/api/v1/finance/budgets/{budgetId}/accounts',
        {
          accountId,
          expectedBudgetVersion: 1,
        },
        { budgetId },
      ),
    );
    await handler(
      request(
        'POST',
        '/api/v1/finance/budgets/{budgetId}/items',
        {
          id: itemId,
          expectedBudgetVersion: 2,
          description: 'Utilities',
          financeCategoryId: categoryId,
          plannedAmountMinor: -5_000,
          currency: 'USD',
          currencyExponent: 2,
          relatedAccountIds: [accountId],
        },
        { budgetId },
      ),
    );
    repository.transactions.push(
      replaceTransactionAllocations(
        createFinancialTransaction({
          id: transactionId,
          accountId,
          origin: 'manual',
          amountMinor: -4_500,
          currency: 'USD',
          transactedAt: '2027-09-15T12:00:00.000Z',
          description: 'Utilities',
          pending: false,
          connectedAccount: false,
        }),
        [
          {
            id: '01J00000000000000000000957',
            amountMinor: -4_500,
            financeCategoryId: categoryId,
            budgetItemId: itemId,
          },
        ],
        manager.id,
      ),
    );

    const response = await handler(
      request(
        'POST',
        '/api/v1/finance/budgets/{budgetId}/reconcile',
        {
          expectedVersion: 3,
        },
        { budgetId },
      ),
    );
    expect(response.statusCode).toBe(201);
    expect(parsed(response)).toMatchObject({
      budgetId,
      reconciledBy: manager.id,
      budgetVersion: 3,
    });
    const detail = parsed(
      await handler(request('GET', '/api/v1/finance/budgets/{budgetId}', undefined, { budgetId })),
    );
    expect(detail).toMatchObject({ status: 'active', version: 4 });
    expect(detail.reconciliations).toHaveLength(1);

    const conflictRequest = request(
      'POST',
      '/api/v1/finance/budgets/{budgetId}/reconcile',
      {
        expectedVersion: 3,
      },
      { budgetId },
    );
    conflictRequest.headers['idempotency-key'] = 'stale-reconciliation-attempt';
    const conflict = await handler(conflictRequest);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body).not.toMatch(/Utilities|Checking|-4500/u);
  });
});

it('lets an administrator create and synchronize their own and managed-group accounts only', async () => {
  const repository = new FinanceMemoryRepository();
  const groupId = '01J00000000000000000000001';
  const memberGroupId = '01J00000000000000000000002';
  const administrator = {
    ...actor,
    role: 'admin' as const,
    groupMemberships: [
      { groupId, role: 'owner' as const },
      { groupId: memberGroupId, role: 'member' as const },
    ],
  };
  const handler = createFinanceHandler(
    registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => administrator,
      deletionSigningSecret: 'test-secret',
      allowedSimplefinHosts: [],
    }),
  );
  const scopes = [
    { type: 'owner', ownerId: actor.id },
    { type: 'group', groupId },
    { type: 'owner', ownerId: 'someone-else' },
    { type: 'group', groupId: memberGroupId },
    { type: 'group', groupId: '01J00000000000000000000003' },
  ];
  for (const [index, scope] of scopes.entries()) {
    const event = request('POST', '/api/v1/finance/accounts', {
      scope,
      sourceName: 'Checking',
      organizationName: 'Test',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 99999999,
      balanceAt: '2026-01-01T00:00:00.000Z',
    });
    event.headers['idempotency-key'] = `administrator-account-${index}`;
    expect((await handler(event)).statusCode).toBe(index < 2 ? 201 : 404);
  }
  const listed = parsed(await handler(request('GET', '/api/v1/finance/accounts')));
  expect(listed.items).toHaveLength(2);
  const bootstrap = parsed(await handler(request('GET', '/api/v1/finance/sync/bootstrap')));
  expect(bootstrap.scopes).toEqual([
    `OWNER#${actor.id}`,
    `GROUP#${groupId}`,
    `GROUP#${memberGroupId}`,
  ]);
  expect(bootstrap.records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityType: 'financeAccount',
        value: expect.objectContaining({ scope: scopes[0] }),
      }),
      expect.objectContaining({
        entityType: 'financeAccount',
        value: expect.objectContaining({ scope: scopes[1] }),
      }),
    ]),
  );
  expect(repository.accounts.size).toBe(2);
});
