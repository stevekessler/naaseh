import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { FinanceRouteRegistry } from '../../apps/api/src/finance/handlers.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { registerUpcomingExpenseRoutes } from '../../apps/api/src/finance/upcoming-expense-handlers.js';
import {
  buildExperienceFixture,
  experienceId,
  EXPERIENCE_GROUP_ID,
} from '../fixtures/finance/experience.js';

const event = (method: string, path: string, mutation: string, body?: unknown) =>
  ({
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'idempotency-key': mutation },
    requestContext: {
      requestId: mutation,
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;

const body = <T>(response: APIGatewayProxyResultV2) => {
  if (typeof response !== 'object' || !response.body) throw new Error('Missing response body.');
  return JSON.parse(response.body) as T;
};

describe('upcoming expense HTTP routes', () => {
  it('creates, lists, edits, reads and fulfills the canonical expense', async () => {
    const fixture = buildExperienceFixture();
    const repository = new FinanceMemoryRepository();
    for (const account of fixture.accounts) repository.accounts.set(account.id, account);
    for (const budget of fixture.budgets) repository.budgets.set(budget.id, budget);
    repository.transactions.push(...fixture.transactions);
    const registry = registerUpcomingExpenseRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => fixture.actors.owner,
    });
    const invoke = async (method: string, path: string, mutation: string, payload?: unknown) => {
      const route = registry.resolve(method, path);
      if (!route) throw new Error(`Missing route ${method} ${path}`);
      return route(event(method, path, mutation, payload));
    };
    const expenseId = experienceId(891);
    const account = fixture.accounts[1]!;
    const createdResponse = await invoke(
      'POST',
      '/api/v1/finance/upcoming-expenses',
      'http-create',
      {
        id: expenseId,
        groupId: EXPERIENCE_GROUP_ID,
        accountId: account.id,
        budgetId: fixture.budgets[0]!.id,
        description: 'Vehicle registration',
        expectedAmountMinor: 8_000,
        dueDate: '2026-11-05',
        entryContext: {
          enteredAt: '2026-10-31T18:00:00.000Z',
          localDate: '2026-10-31',
          timeZone: 'America/Denver',
        },
      },
    );
    expect(createdResponse.statusCode).toBe(201);
    expect(
      body<{ expense: { entryContext: { localDate: string } } }>(createdResponse).expense
        .entryContext.localDate,
    ).toBe('2026-10-31');

    const changedResponse = await invoke(
      'PATCH',
      `/api/v1/finance/upcoming-expenses/${expenseId}`,
      'http-update',
      {
        description: 'Vehicle registration renewal',
        dueDate: '2026-11-12',
        dateChangeContext: {
          enteredAt: '2026-11-01T18:00:00.000Z',
          localDate: '2026-11-01',
          timeZone: 'America/Denver',
        },
        expectedVersion: 1,
      },
    );
    const changed = body<{
      expense: {
        description: string;
        dueDate: string;
        version: number;
        entryContext: { localDate: string };
      };
    }>(changedResponse);
    expect(changed.expense).toMatchObject({
      description: 'Vehicle registration renewal',
      dueDate: '2026-11-12',
      version: 3,
    });
    expect(changed.expense.entryContext.localDate).toBe('2026-10-31');

    const transaction = fixture.transactions[4]!;
    const fulfilledResponse = await invoke(
      'POST',
      `/api/v1/finance/upcoming-expenses/${expenseId}/fulfillments`,
      'http-fulfill',
      {
        id: experienceId(892),
        transactionId: transaction.id,
        amountMinor: 2_000,
        expectedExpenseVersion: 3,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: 0,
      },
    );
    expect(fulfilledResponse.statusCode).toBe(201);
    expect(
      body<{
        fulfilledAmountMinor: number;
        remainingAmountMinor: number;
        claimVersion: number;
      }>(fulfilledResponse),
    ).toMatchObject({
      fulfilledAmountMinor: 2_000,
      remainingAmountMinor: 6_000,
      claimVersion: 1,
    });

    const readResponse = await invoke(
      'GET',
      `/api/v1/finance/upcoming-expenses/${expenseId}`,
      'http-read',
    );
    expect(body<{ expense: { id: string } }>(readResponse).expense.id).toBe(expenseId);
    const listResponse = await invoke('GET', '/api/v1/finance/upcoming-expenses', 'http-list');
    expect(body<{ items: unknown[] }>(listResponse).items).toHaveLength(1);
  });
});
