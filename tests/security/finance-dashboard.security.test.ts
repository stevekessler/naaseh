import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { expect, it, vi } from 'vitest';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { experienceId } from '../fixtures/finance/experience.js';

it('omits a revoked dashboard flag and its budget values without leaking another owner’s preferences', async () => {
  const budgetId = experienceId(2);
  const groupId = experienceId(3);
  const scope = 'FINANCE#SCOPE#GROUP#' + groupId;
  const rows = new Map<string, Record<string, unknown>>();
  const put = (PK: string, SK: string, value: Record<string, unknown>) =>
    rows.set(JSON.stringify([PK, SK]), { PK, SK, ...value });
  const addSource = (partition: string, collection: string, id: string, value: object) => {
    const storageKey = { PK: partition, SK: 'ROW#' + collection + '#' + id };
    const locator = financeLocatorKey(collection, id);
    put(locator.PK, locator.SK, { storageKey });
    put(partition, 'META', { revision: 1 });
    put(partition, storageKey.SK, {
      collection,
      entryKey: id,
      data: { id, status: 'active', version: 1, ...value },
    });
  };
  addSource(scope, 'budgets', budgetId, {
    groupId,
    name: 'Private budget name',
    startDate: '2026-11-01',
  });
  const hiddenAccount = experienceId(4);
  addSource('FINANCE#SCOPE#OWNER#other', 'accounts', hiddenAccount, {
    scope: { type: 'owner', ownerId: 'other' },
    currentBalanceMinor: 987654,
  });
  addSource(scope, 'budgetAccountLinks', experienceId(5), {
    budgetId,
    accountId: hiddenAccount,
  });
  addSource(scope, 'budgetItems', experienceId(6), {
    budgetId,
    relatedAccountIds: [hiddenAccount],
    currency: 'USD',
    currencyExponent: 2,
    plannedAmountMinor: -987654,
  });
  put('GROUP#' + groupId, 'MEMBER#owner', {
    data: { groupId, userId: 'owner', role: 'member', status: 'active', version: 1 },
  });
  put('USER#owner', 'FINANCE_DASHBOARD#budget#' + budgetId, {
    version: 1,
    data: { targetKind: 'budget', targetId: budgetId, included: true, version: 1 },
  });
  put('USER#owner', 'FINANCE_DASHBOARD#SETTINGS', {
    version: 1,
    data: { upcomingCount: 20, version: 1 },
  });
  const send = vi.spyOn(dynamodb, 'send').mockImplementation((async (command) => {
    if (command instanceof GetCommand) {
      const { PK, SK } = command.input.Key!;
      return { Item: rows.get(JSON.stringify([PK, SK])) };
    }
    if (command instanceof QueryCommand) {
      const values = command.input.ExpressionAttributeValues!;
      return {
        Items: [...rows.values()].filter(
          (row) => row.PK === values[':pk'] && String(row.SK).startsWith(String(values[':prefix'])),
        ),
      };
    }
    throw new Error('Unexpected dashboard persistence operation.');
  }) as typeof dynamodb.send);
  const handle = createFinanceHandler(undefined, async () => ({
    requirePin: false,
    securityRevision: 0,
    sessionEpoch: 1,
  }));
  const read = async (path: string, userId: string, role: 'admin' | 'user') => {
    const response = await handle({
      rawPath: '/api/v1/finance/' + path,
      headers: {},
      requestContext: {
        requestId: 'test-dashboard',
        http: { method: 'GET' },
        authorizer: { lambda: { userId, role } },
      },
    } as APIGatewayProxyEventV2);
    expect(response).toMatchObject({ statusCode: 200 });
    return JSON.parse((response as { body: string }).body) as unknown;
  };

  try {
    const budgetPath = 'dashboard/budgets/' + budgetId;
    expect(await read(budgetPath, 'owner', 'user')).toEqual({
      id: budgetId,
      name: 'Private budget name',
      startDate: '2026-11-01',
      items: [],
      accountIds: [],
      complete: false,
    });
    expect(await read('dashboard-preferences', 'owner', 'user')).toMatchObject({
      flags: [{ targetId: budgetId }],
      settings: { upcomingCount: 20 },
    });
    const defaults = { flags: [], settings: { upcomingCount: 10, version: 0 } };
    expect(await read('dashboard-preferences', 'other', 'admin')).toEqual(defaults);
    expect(await read(budgetPath, 'other', 'admin')).toBeNull();

    rows.delete(JSON.stringify(['GROUP#' + groupId, 'MEMBER#owner']));
    expect(await read('dashboard-preferences', 'owner', 'user')).toEqual({
      flags: [],
      settings: { upcomingCount: 20, version: 1 },
    });
    expect(await read(budgetPath, 'owner', 'user')).toBeNull();
  } finally {
    send.mockRestore();
  }
});
