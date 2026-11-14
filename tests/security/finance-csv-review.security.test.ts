import { expect, it } from 'vitest';
import { createFinancialTransaction } from '@naaseh/domain';
import { identifyCsvDuplicateOrdinals } from '../../apps/api/src/finance/csv-import-service.js';

const row = {
  ordinal: 1,
  amountMinor: -425,
  transactedAt: '2026-01-02T00:00:00.000Z',
  description: 'Coffee',
};
const transaction = (id: string, accountId: string) =>
  createFinancialTransaction({
    ...row,
    id,
    accountId,
    origin: 'manual',
    currency: 'USD',
    pending: false,
    connectedAccount: false,
  });

it('only marks exact matches from the selected account and returns input ordinals', () => {
  const selected = transaction('selected-txn', 'selected');
  const other = transaction('other-txn', 'other');
  expect(identifyCsvDuplicateOrdinals([other], { accountId: 'selected', rows: [row] })).toEqual([]);
  expect(
    identifyCsvDuplicateOrdinals([other, selected], {
      accountId: 'selected',
      rows: [row, { ...row, ordinal: 2, description: 'Lunch' }],
    }),
  ).toEqual([1]);
});

it('ignores rows already committed by the same CSV batch on a retry', () => {
  const imported = {
    ...transaction('imported', 'selected'),
    origin: 'csv' as const,
    csvImportBatchId: 'saved-batch',
  };
  const legacy = { ...transaction('saved-batch:1', 'selected'), origin: 'csv' as const };
  const input = { accountId: 'selected', rows: [row] };
  expect(identifyCsvDuplicateOrdinals([imported, legacy], input)).toEqual([1]);
  expect(
    identifyCsvDuplicateOrdinals([imported, legacy], { ...input, batchId: 'saved-batch' }),
  ).toEqual([]);
});
