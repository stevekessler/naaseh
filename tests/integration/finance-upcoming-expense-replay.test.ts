import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { Mutation } from '@naaseh/domain';
import { dispatchFinanceReplay } from '../../apps/api/src/finance/sync-replay.js';
import { experienceId } from '../fixtures/finance/experience.js';

const request = {
  version: '2.0',
  rawPath: '/api/v1/sync/push',
  rawQueryString: '',
  headers: {},
  requestContext: {
    requestId: 'replay-request',
    http: {
      method: 'POST',
      path: '/api/v1/sync/push',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'vitest',
    },
    routeKey: 'POST /api/v1/sync/push',
    stage: '$default',
    time: '',
    timeEpoch: 0,
    authorizer: { lambda: { userId: 'experience-owner' } },
  },
  isBase64Encoded: false,
} as APIGatewayProxyEventV2;

const response = (body: unknown): APIGatewayProxyResultV2 => ({
  statusCode: 201,
  body: JSON.stringify(body),
});

describe('upcoming expense protected sync replay', () => {
  it('forwards the original entry context without replacing it with reconnect time', async () => {
    const expenseId = experienceId(950);
    const mutation: Mutation = {
      id: experienceId(951),
      entityId: expenseId,
      entityType: 'financeUpcomingExpense',
      operation: 'create',
      baseVersion: 0,
      payload: {
        id: expenseId,
        groupId: experienceId(1),
        accountId: experienceId(101),
        budgetId: experienceId(200),
        description: 'Delayed renewal',
        expectedAmountMinor: 4_000,
        dueDate: '2026-11-02',
        entryContext: {
          enteredAt: '2026-10-31T18:00:00.000Z',
          localDate: '2026-10-31',
          timeZone: 'America/Denver',
        },
      },
      createdAt: '2026-11-05T18:00:00.000Z',
      attempts: 0,
    };
    const invoke = vi.fn(async (forwarded: APIGatewayProxyEventV2) => {
      void forwarded;
      return response({ expense: { id: expenseId, version: 1 } });
    });
    const result = await dispatchFinanceReplay(request, mutation, invoke);
    expect(result).toMatchObject({ mutationId: mutation.id, status: 'applied', version: 1 });
    const forwarded = invoke.mock.calls[0]![0];
    expect(forwarded.rawPath).toBe('/api/v1/finance/upcoming-expenses');
    expect(forwarded.headers['x-finance-sync-replay']).toBe('upcoming-expense-create-v1');
    expect(JSON.parse(forwarded.body ?? '{}')).toMatchObject({
      dueDate: '2026-11-02',
      entryContext: mutation.payload.entryContext,
    });
  });

  it('replays an offline payment as a proposal and acknowledges only its claim record', async () => {
    const expenseId = experienceId(952);
    const fulfillmentId = experienceId(953);
    const mutation: Mutation = {
      id: experienceId(954),
      entityId: fulfillmentId,
      entityType: 'financeFulfillment',
      operation: 'create',
      baseVersion: 0,
      payload: {
        id: fulfillmentId,
        upcomingExpenseId: expenseId,
        transactionId: experienceId(104),
        amountMinor: 2_000,
        expectedExpenseVersion: 1,
        expectedTransactionVersion: 1,
        expectedClaimVersion: 0,
        proposalStatus: 'pending-server-acceptance',
      },
      createdAt: '2026-11-05T18:00:00.000Z',
      attempts: 0,
    };
    const invoke = vi.fn(async () =>
      response({
        expense: { id: expenseId, version: 2 },
        fulfillments: [{ id: fulfillmentId, version: 1 }],
      }),
    );
    const result = await dispatchFinanceReplay(request, mutation, invoke);
    expect(result).toMatchObject({ mutationId: mutation.id, status: 'applied', version: 1 });
    const forwarded = invoke.mock.calls[0]![0];
    expect(forwarded.rawPath).toBe(`/api/v1/finance/upcoming-expenses/${expenseId}/fulfillments`);
    expect(forwarded.headers['x-finance-sync-replay']).toBe('expense-fulfillment-create-v1');
    expect(JSON.parse(forwarded.body ?? '{}')).not.toHaveProperty('proposalStatus');
  });
});
