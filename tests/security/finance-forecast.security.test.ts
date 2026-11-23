import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, expect, it, vi } from 'vitest';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import * as forecast from '../../apps/api/src/finance/forecast-service.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { SafeApiError } from '../../apps/api/src/shared/http.js';
import { experienceId } from '../fixtures/finance/experience.js';

const budgetId = experienceId(10);
const groupId = experienceId(11);
const visit = { requirePin: true, securityRevision: 4, sessionEpoch: 2 };

const event = () =>
  ({
    rawPath: '/api/v1/finance/budgets/' + budgetId + '/forecast',
    body: JSON.stringify({ method: 'historical' }),
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'test',
      'idempotency-key': 'forecast-test',
      'x-finance-owner': 'viewer',
    },
    requestContext: {
      requestId: 'finance-forecast-test',
      http: { method: 'POST' },
      authorizer: { lambda: { userId: 'viewer', csrfToken: 'test', role: 'admin' } },
    },
  }) as APIGatewayProxyEventV2;

afterEach(() => vi.restoreAllMocks());

it('does not read protected forecast data when Finance is locked', async () => {
  const reader = vi.spyOn(forecast, 'readFinanceBudgetForecast');
  const handle = createFinanceHandler(undefined, async () => {
    throw new SafeApiError(423, 'finance_locked', 'Unlock Finance.', 'authorization');
  });
  expect(await handle(event())).toMatchObject({ statusCode: 423 });
  expect(reader).not.toHaveBeenCalled();
});

it('does not allow administrator access to a private budget after membership is revoked', async () => {
  const locator = financeLocatorKey('budgets', budgetId);
  const send = vi.spyOn(dynamodb, 'send').mockImplementation((async (command: GetCommand) => {
    expect(command).toBeInstanceOf(GetCommand);
    const key = command.input.Key;
    if (key?.PK === locator.PK && key.SK === locator.SK)
      return {
        Item: { storageKey: { PK: 'FINANCE#SCOPE#GROUP#' + groupId, SK: 'ROW#budgets#hidden' } },
      };
    if (key?.PK === 'GROUP#' + groupId && key.SK === 'MEMBER#viewer')
      return {
        Item: {
          data: { groupId, userId: 'viewer', role: 'member', status: 'revoked', version: 2 },
        },
      };
    throw new Error('Denied requests should never read the protected source.');
  }) as typeof dynamodb.send);
  const handle = createFinanceHandler(undefined, async () => visit);
  expect(await handle(event())).toMatchObject({ statusCode: 404 });
  expect(send).toHaveBeenCalledTimes(2);
});

it('withholds results if the PIN revision changes while the forecast runs', async () => {
  const read = vi.spyOn(forecast, 'readFinanceBudgetForecast').mockResolvedValue({
    budgetId,
    window: { basis: 'custom', dateFrom: '2026-11-01', dateTo: '2026-11-30' },
    asOfDate: '2026-11-22',
    timeZone: 'UTC',
    sourceAsOf: '2026-11-22T12:00:00.000Z',
    sourceRevision: 'protected-revision',
    coverage: 'partial',
    method: 'historical',
    status: 'insufficient-history',
    includeNonBudgetedHistory: false,
    observed: { dateFrom: '2026-05-01', dateTo: '2026-10-31', coveredMonths: 0 },
    currencies: [],
  });
  const authorize = vi
    .fn()
    .mockResolvedValueOnce(visit)
    .mockResolvedValueOnce({ ...visit, securityRevision: 5 });
  const result = await createFinanceHandler(undefined, authorize)(event());
  expect(result).toMatchObject({ statusCode: 409 });
  expect(JSON.stringify(result)).not.toContain('protected-revision');
  expect(read).toHaveBeenCalledWith({
    userId: 'viewer',
    securityRevision: 4,
    budgetId,
    request: { method: 'historical' },
  });
});
