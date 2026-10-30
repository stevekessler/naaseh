import { describe, expect, it } from 'vitest';
import { addMinorUnits, currencyExponentFor, parseMajorUnits } from './money.js';
import { financeScopeSchema, financeAudience } from './scope.js';
import { assertFinanceTransition } from './lifecycle.js';
import { nextFinanceRevision } from './source-snapshot.js';
import { financeSourceSnapshotSchema } from './source-snapshot.js';

describe('finance foundation', () => {
  it('uses exact safe minor-unit arithmetic with currency exponents', () => {
    expect(currencyExponentFor('JPY')).toBe(0);
    expect(currencyExponentFor('USD')).toBe(2);
    expect(currencyExponentFor('BHD')).toBe(3);
    expect(parseMajorUnits('12.345', 'BHD')).toBe(12_345);
    expect(parseMajorUnits('-84.25', 'USD')).toBe(-8_425);
    expect(() => parseMajorUnits('1.001', 'USD')).toThrow(/decimal|fraction/i);
    expect(() => addMinorUnits([Number.MAX_SAFE_INTEGER, 1])).toThrow(/safe/i);
  });

  it('validates owner and group scopes and derives their one authorized audience', () => {
    expect(financeAudience(financeScopeSchema.parse({ type: 'owner', ownerId: 'owner-1' }))).toBe(
      'OWNER#owner-1',
    );
    expect(
      financeAudience(
        financeScopeSchema.parse({ type: 'group', groupId: '01J00000000000000000000001' }),
      ),
    ).toBe('GROUP#01J00000000000000000000001');
    expect(financeScopeSchema.safeParse({ type: 'public' }).success).toBe(false);
  });

  it('permits only explicit lifecycle transitions', () => {
    expect(assertFinanceTransition('active', 'archived')).toBe('archived');
    expect(assertFinanceTransition('attention', 'active')).toBe('active');
    expect(() => assertFinanceTransition('archived', 'deleting')).toThrow(/transition/i);
  });

  it('increments revisions and keeps provider snapshots separate from user fields', () => {
    expect(nextFinanceRevision(3, ['providerSnapshot'])).toEqual({
      version: 4,
      changedFields: ['providerSnapshot'],
    });
    expect(
      financeSourceSnapshotSchema.safeParse({
        source: 'simplefin',
        sourceId: 'provider-transaction-1',
        capturedAt: '2026-01-20T08:00:00.000Z',
        description: 'Fixture purchase',
        friendlyName: 'must remain user-owned',
      }).success,
    ).toBe(false);
  });
});
