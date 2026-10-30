import { describe, expect, it } from 'vitest';
import {
  archiveFinanceCategory,
  assertUniqueActiveCategoryName,
  canPermanentlyDeleteFinanceCategory,
  canonicalFinanceCategoryName,
  createBankFinanceCategory,
  createUserFinanceCategory,
  renameFinanceCategory,
} from './category.js';
import {
  archiveMerchant,
  canPermanentlyDeleteMerchant,
  canonicalMerchantKey,
  createMerchant,
  historicalMerchantLabel,
  mergeMerchant,
} from './merchant.js';

const user = { id: 'user-a', role: 'user' as const, active: true };
const other = { id: 'user-b', role: 'user' as const, active: true };
const admin = { id: 'admin-a', role: 'admin' as const, active: true };

describe('global Finance category catalog', () => {
  it('uses a canonical active-name lock and limits user changes to the creator or admin', () => {
    const category = createUserFinanceCategory({
      id: '01J00000000000000000000061',
      name: '  Dining   Out ',
      creatorId: user.id,
    });
    expect(canonicalFinanceCategoryName(category.name)).toBe('dining out');
    expect(() => assertUniqueActiveCategoryName([category], 'DINING OUT')).toThrow(/already uses/i);
    expect(renameFinanceCategory(category, 'Restaurants', user).name).toBe('Restaurants');
    expect(() => renameFinanceCategory(category, 'Restaurants', other)).toThrow(
      /creator or administrator/i,
    );
    expect(archiveFinanceCategory(category, admin).status).toBe('archived');
  });

  it('keeps bank categories source-managed and deletes only unreferenced user mistakes', () => {
    const bank = createBankFinanceCategory({
      id: '01J00000000000000000000062',
      name: 'Grocery Stores',
      merchantCategoryCode: '5411',
    });
    expect(() => archiveFinanceCategory(bank, admin)).toThrow(/source-managed/i);
    const userCategory = createUserFinanceCategory({
      id: '01J00000000000000000000063',
      name: 'Mistake',
      creatorId: user.id,
    });
    expect(canPermanentlyDeleteFinanceCategory(userCategory, user, false, true)).toBe(true);
    expect(canPermanentlyDeleteFinanceCategory(userCategory, user, true, true)).toBe(false);
  });
});

describe('global Finance merchant catalog', () => {
  it('canonicalizes name and location while preserving readable historical labels', () => {
    const merchant = createMerchant({
      id: '01J00000000000000000000071',
      name: ' Café—North ',
      city: ' Denver ',
      region: ' CO ',
      source: 'manual',
      creatorId: user.id,
    });
    expect(merchant.canonicalKey).toBe(canonicalMerchantKey('Café—North', 'Denver', 'CO'));
    expect(historicalMerchantLabel(archiveMerchant(merchant, user))).toBe('Café—North (archived)');
  });

  it('restricts removal to unreferenced mistakes and makes merges admin-only aliases', () => {
    const merchant = createMerchant({
      id: '01J00000000000000000000072',
      name: 'Fixture Cafe',
      source: 'manual',
      creatorId: user.id,
    });
    expect(canPermanentlyDeleteMerchant(merchant, user, false, true)).toBe(true);
    expect(canPermanentlyDeleteMerchant(merchant, user, true, true)).toBe(false);
    expect(() => mergeMerchant(merchant, '01J00000000000000000000073', user)).toThrow(
      /administrator/i,
    );
    expect(mergeMerchant(merchant, '01J00000000000000000000073', admin)).toMatchObject({
      status: 'merged',
      mergedIntoId: '01J00000000000000000000073',
    });
  });
});
