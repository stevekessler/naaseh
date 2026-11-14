import { describe, expect, it } from 'vitest';
import { createMerchant } from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { updateFinanceMerchant } from '../../apps/api/src/finance/transaction-service.js';

const actor = (id: string, role: 'admin' | 'user' = 'user'): FinanceActor => ({
  id,
  role,
  active: true,
  groupMemberships: [],
});

describe('Finance catalog edit authorization', () => {
  it('permits the creator or an administrator and denies another user', () => {
    const repository = new FinanceMemoryRepository();
    const merchant = createMerchant({
      id: 'merchant-a',
      name: 'Creator Cafe',
      source: 'manual',
      creatorId: 'creator-a',
    });
    repository.merchants.set(merchant.id, merchant);
    repository.merchantKeyLocks.set(merchant.canonicalKey, merchant.id);

    expect(() =>
      updateFinanceMerchant(
        repository,
        actor('outsider-a'),
        merchant.id,
        { expectedVersion: 1, name: 'Stolen Name' },
        'unauthorized-edit',
      ),
    ).toThrow(/creator or administrator/iu);
    expect(repository.merchants.get(merchant.id)).toEqual(merchant);

    expect(
      updateFinanceMerchant(
        repository,
        actor('creator-a'),
        merchant.id,
        { expectedVersion: 1, name: 'Creator Coffee' },
        'creator-edit',
      ).name,
    ).toBe('Creator Coffee');
    expect(
      updateFinanceMerchant(
        repository,
        actor('admin-a', 'admin'),
        merchant.id,
        { expectedVersion: 2, region: 'CO' },
        'admin-edit',
      ).region,
    ).toBe('CO');
  });

  it('allows only an administrator to edit imported merchants without a creator', () => {
    const repository = new FinanceMemoryRepository();
    const imported = createMerchant({ id: 'merchant-imported', name: 'Provider Shop', source: 'imported' });
    repository.merchants.set(imported.id, imported);
    repository.merchantKeyLocks.set(imported.canonicalKey, imported.id);

    expect(() =>
      updateFinanceMerchant(
        repository,
        actor('user-a'),
        imported.id,
        { expectedVersion: 1, name: 'Provider Store' },
        'imported-user-edit',
      ),
    ).toThrow(/administrator/iu);
    expect(
      updateFinanceMerchant(
        repository,
        actor('admin-a', 'admin'),
        imported.id,
        { expectedVersion: 1, name: 'Provider Store' },
        'imported-admin-edit',
      ),
    ).toMatchObject({ id: imported.id, name: 'Provider Store', source: 'imported', version: 2 });
  });
});
