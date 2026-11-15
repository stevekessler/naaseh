import { describe, expect, it } from 'vitest';
import { financeQueryEnvelopeSchema } from '@naaseh/contracts';
import { parseSpendReportRequest } from '../../apps/api/src/finance/spend-report-service.js';

const account = '01J00000000000000000000601';
const other = '01J00000000000000000000602';
const category = '01J00000000000000000000603';
const instant = new Date('2026-11-01T03:00:00Z');

describe('Spend report request and delivery contracts', () => {
  it('defaults to the selected time zone’s calendar month and all accessible accounts', () => {
    const request = parseSpendReportRequest('timeZone=America%2FDenver', [account], instant);
    expect(request.query).toMatchObject({
      accountIds: [account],
      filters: { postedSpendOnly: true, dateFrom: '2026-10-01', dateTo: '2026-10-31' },
    });
  });

  it('normalizes repeated account and category values and refuses broadened or client-pinned scope', () => {
    const explicit = parseSpendReportRequest(
      `accountIds[]=${account}&accountIds=${account}&categoryIds[]=${category}&date=2026-11-01`,
      [account, other],
      instant,
    );
    expect(explicit.query).toMatchObject({
      accountIds: [account],
      filters: { categoryIds: [category], date: '2026-11-01' },
    });
    expect(() => parseSpendReportRequest('accountIds=' + other, [account], instant)).toThrow();
    expect(() => parseSpendReportRequest('cursor=forged', [account], instant)).toThrow();
    expect(() =>
      parseSpendReportRequest('date=2026-11-01&dateFrom=2026-11-02', [account], instant),
    ).toThrow();
  });

  it('keeps row readiness separate from exact aggregates and verified empty scope', () => {
    const pending = {
      items: [{ id: account }],
      asOf: instant.toISOString(),
      projectionRevision: 'indexed',
      complete: false,
      rowsState: 'ready',
      aggregateState: 'pending',
      coverage: { examined: 1, scopeComplete: false },
    };
    expect(financeQueryEnvelopeSchema.safeParse(pending).success).toBe(true);
    expect(financeQueryEnvelopeSchema.safeParse({ ...pending, totalCount: 1 }).success).toBe(false);
    expect(
      financeQueryEnvelopeSchema.safeParse({ ...pending, items: [], rowsState: 'confirmed-empty' })
        .success,
    ).toBe(false);
    expect(
      financeQueryEnvelopeSchema.safeParse({
        ...pending,
        items: [],
        rowsState: 'confirmed-empty',
        aggregateState: 'exact',
        complete: true,
        coverage: { examined: 1, scopeComplete: true },
        totalCount: 0,
        totalsByCurrency: [],
      }).success,
    ).toBe(true);
  });
});
