import { describe, expect, it, vi } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import { contributionDelta } from '../../apps/api/src/finance/spend-projection-service.js';

const fact = {
  id: 't1',
  accountId: 'a1',
  effectiveAt: '2026-10-01T12:00:00Z',
  currency: 'USD',
  currencyExponent: 2,
  amountMinor: -100,
  description: 'Synthetic expense',
  sourceVersion: 1,
  slices: [],
};
const request = {
  userId: 'u1',
  accountId: 'a1',
  sourceRevision: 'r1',
  securityRevision: 1,
  filters: {},
  limit: 50,
};
function setup(responses: object[]) {
  const send = vi.fn();
  responses.forEach((r) => send.mockResolvedValueOnce(r));
  const authorize = vi.fn(async () => true);
  const repository = new FinanceReadRepository({
    client: { send },
    tableName: 'table',
    cursorSecret: 'x'.repeat(32),
    authorize,
  });
  return { repository, send, authorize };
}

describe('bounded source-authorized Finance indexed reads', () => {
  it('uses a date index and a hard examined-row budget without scope hydration', async () => {
    const { repository, send } = setup([{ Items: [{ fact }], ScannedCount: 1 }]);
    const result = await repository.read(request);
    expect(result.items).toEqual([fact]);
    expect(result.rowsState).toBe('ready');
    const command = send.mock.calls[0]![0] as QueryCommand;
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input).toMatchObject({
      Limit: 1_000,
      ConsistentRead: true,
      ScanIndexForward: false,
      ExpressionAttributeValues: { ':pk': 'FINANCE#FACT_ACCOUNT#a1' },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('probes exact leading-zero check numbers without scanning all account facts', async () => {
    const { repository, send } = setup([{ Items: [], ScannedCount: 0 }]);
    const result = await repository.read({ ...request, filters: { checkNumber: ' 00123 ' } });
    const command = send.mock.calls[0]![0] as QueryCommand;
    expect(command.input.ExpressionAttributeValues?.[':pk']).toContain(
      'FINANCE#FACT_SEARCH#a1#check#00123',
    );
    expect(result.rowsState).toBe('confirmed-empty');
    expect(result.coverage.scopeComplete).toBe(true);
  });

  it('binds signed cursors to owner, account, filters, source and security revisions', async () => {
    const { repository } = setup([
      { Items: [{ fact }], ScannedCount: 1, LastEvaluatedKey: { PK: 'p', SK: 's' } },
    ]);
    const result = await repository.read(request);
    expect(result.nextCursor).toBeTruthy();
    for (const changed of [
      { userId: 'u2' },
      { accountId: 'a2' },
      { sourceRevision: 'r2' },
      { securityRevision: 2 },
      { filters: { text: 'other' } },
    ]) {
      await expect(
        repository.read({ ...request, ...changed, cursor: result.nextCursor }),
      ).rejects.toThrow(/cursor|context/i);
    }
    await expect(repository.read({ ...request, cursor: result.nextCursor + 'x' })).rejects.toThrow(
      /cursor/i,
    );
  });

  it('distinguishes an empty intermediate page and rechecks authorization before delivery', async () => {
    const { repository, authorize } = setup([
      { Items: [], ScannedCount: 1_000, LastEvaluatedKey: { PK: 'p', SK: 's' } },
      { Items: [{ fact }], ScannedCount: 1 },
    ]);
    const result = await repository.read(request);
    expect(result.rowsState).toBe('searching');
    expect(result.aggregateState).toBe('pending');
    expect(result.totalCount).toBeUndefined();
    authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(repository.read(request)).rejects.toThrow(/access|authoriz/i);
  });

  it('reverses obsolete contributions and treats the same publication revision as a retry', () => {
    const previous = {
      transactionId: 't1',
      sourceVersion: 1,
      slices: [
        {
          transactionId: 't1',
          accountId: 'a1',
          effectiveAt: '2026-10-01T12:00:00Z',
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: 100,
        },
      ],
    };
    expect(contributionDelta(previous, previous)).toEqual([]);
    const delta = contributionDelta(previous, {
      ...previous,
      sourceVersion: 2,
      slices: [{ ...previous.slices[0]!, amountMinor: 70 }],
    });
    expect(delta.map((s) => s.amountMinor)).toEqual([-100, 70]);
  });
});
