import { describe, expect, it } from 'vitest';
import {
  financeCursorSchema,
  financeIdempotencyKeySchema,
  financeProblemSchema,
  manualFinanceAccountInputSchema,
} from '@naaseh/contracts';

describe('Finance HTTP contract', () => {
  it('requires complete account identity and applies the deterministic friendly-name default', () => {
    const account = manualFinanceAccountInputSchema.parse({
      scope: { type: 'owner', ownerId: 'fixture-owner' },
      sourceName: 'Household Checking',
      organizationName: 'Example Community Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 125_000,
      balanceAt: '2026-01-15T12:00:00.000Z',
    });
    expect(account.friendlyName).toBe('Example Community Bank - Household Checking');
    expect(
      manualFinanceAccountInputSchema.safeParse({ ...account, organizationName: '' }).success,
    ).toBe(false);
  });

  it('uses bounded opaque cursors, idempotency keys, and RFC 9457 problems', () => {
    expect(financeCursorSchema.parse('cursor_123')).toBe('cursor_123');
    expect(financeCursorSchema.safeParse('x'.repeat(513)).success).toBe(false);
    expect(financeIdempotencyKeySchema.safeParse('fixture-request-1').success).toBe(true);
    expect(
      financeProblemSchema.parse({
        type: 'https://naaseh.example/problems/finance-conflict',
        title: 'Finance record changed',
        status: 409,
        code: 'FINANCE_CONFLICT',
        correlationId: 'fixture-correlation',
      }).status,
    ).toBe(409);
  });
});
