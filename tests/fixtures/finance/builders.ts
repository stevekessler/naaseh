import { manualCheckingAccountFixture } from './accounts.js';
import { groceryTransactionFixture } from './transactions.js';

export function buildFinanceAccount(overrides: Partial<typeof manualCheckingAccountFixture> = {}) {
  return { ...manualCheckingAccountFixture, ...overrides };
}

export function buildFinanceTransaction(overrides: Partial<typeof groceryTransactionFixture> = {}) {
  return { ...groceryTransactionFixture, ...overrides };
}

export function buildBudgetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '01J00000000000000000000020',
    scope: { type: 'group' as const, groupId: '01J00000000000000000000001' },
    name: 'Fixture monthly plan',
    startsOn: '2026-01-01',
    endsOn: '2026-01-31',
    currency: 'USD',
    version: 1,
    ...overrides,
  };
}
