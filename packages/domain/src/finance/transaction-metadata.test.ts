import { describe, expect, it } from 'vitest';
import {
  applyTransactionPaymentMetadata,
  correctFinancialTransaction,
  createFinancialTransaction,
  displayPaymentType,
  normalizeCheckNumber,
  normalizePaymentType,
} from './transaction.js';

describe('transaction payment metadata', () => {
  it('normalizes supported payment types without inferring one from a check number', () => {
    expect(normalizePaymentType('  CHECK ')).toBe('check');
    expect(normalizePaymentType('Digital (Other)')).toBe('digital-other');
    expect(normalizePaymentType(undefined)).toBeUndefined();
    expect(normalizeCheckNumber('  000123  ')).toBe('000123');
    expect(normalizeCheckNumber('   ')).toBeUndefined();

    expect(applyTransactionPaymentMetadata({}, { checkNumber: '000123' })).toEqual({
      checkNumber: '000123',
    });
  });

  it('allows every supported value and keeps a check number optional for checks', () => {
    for (const paymentType of ['cash', 'check', 'card', 'ach', 'digital-other'] as const) {
      expect(applyTransactionPaymentMetadata({}, { paymentType })).toEqual({ paymentType });
    }
    expect(applyTransactionPaymentMetadata({}, { paymentType: 'check' })).toEqual({
      paymentType: 'check',
    });
  });

  it('preserves unknown legacy source values but displays them as unspecified', () => {
    expect(normalizePaymentType('wire-transfer')).toBe('wire-transfer');
    expect(displayPaymentType('wire-transfer')).toBe('Unspecified');
    expect(displayPaymentType(undefined)).toBe('Unspecified');
    expect(displayPaymentType('digital-other')).toBe('Digital (Other)');
  });

  it('lets an explicit user correction replace or clear either field independently', () => {
    const existing = { paymentType: 'card', checkNumber: '000123' } as const;
    expect(applyTransactionPaymentMetadata(existing, { paymentType: 'ach' })).toEqual({
      paymentType: 'ach',
      checkNumber: '000123',
    });
    expect(applyTransactionPaymentMetadata(existing, { checkNumber: null })).toEqual({
      paymentType: 'card',
    });
    expect(applyTransactionPaymentMetadata(existing, { paymentType: null })).toEqual({
      checkNumber: '000123',
    });
  });

  it('rejects overlong payment and check source values without stripping leading zeros', () => {
    expect(() => normalizeCheckNumber('0'.repeat(65))).toThrow(/64/iu);
    expect(() => normalizePaymentType('x'.repeat(65))).toThrow(/64/iu);
  });

  it('keeps user metadata while correcting provider-owned source fields', () => {
    const transaction = createFinancialTransaction({
      id: 'transaction-a',
      accountId: 'account-a',
      origin: 'manual',
      amountMinor: -500,
      currency: 'USD',
      transactedAt: '2026-01-01T12:00:00.000Z',
      description: 'Cafe',
      pending: false,
      connectedAccount: false,
      paymentType: 'check',
      checkNumber: '000123',
    });
    expect(correctFinancialTransaction(transaction, { description: 'Cafe corrected' })).toMatchObject({
      description: 'Cafe corrected',
      paymentType: 'check',
      checkNumber: '000123',
    });
  });
});
