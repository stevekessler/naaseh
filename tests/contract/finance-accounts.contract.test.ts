import { describe, expect, it } from 'vitest';
import {
  balanceSnapshotSchema,
  csvImportChunkInputSchema,
  financeConnectionSchema,
  financialAccountSchema,
  importJobSchema,
  manualFinanceAccountInputSchema,
  manualFinanceTransactionInputSchema,
} from '@naaseh/contracts';

const id = '01J00000000000000000000001';

describe('Finance account contracts', () => {
  it('requires organization and source account names and applies the deterministic default', () => {
    const parsed = manualFinanceAccountInputSchema.parse({
      scope: { type: 'owner', ownerId: 'owner-1' },
      sourceName: 'Checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 100,
      balanceAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.friendlyName).toBe('Fixture Bank - Checking');
    expect(
      manualFinanceAccountInputSchema.safeParse({ ...parsed, organizationName: '' }).success,
    ).toBe(false);
    expect(
      financialAccountSchema.safeParse({
        id,
        scope: parsed.scope,
        sourceName: parsed.sourceName,
        organizationName: parsed.organizationName,
        friendlyName: parsed.friendlyName,
        accountType: parsed.accountType,
        currency: parsed.currency,
        currencyExponent: 2,
        currentBalanceMinor: 100,
        balanceAt: parsed.balanceAt,
        status: 'active',
        version: 1,
      }).success,
    ).toBe(true);
  });

  it('validates balances, manual transactions, and bounded reviewed CSV chunks', () => {
    expect(
      balanceSnapshotSchema.safeParse({
        id,
        accountId: id,
        balanceMinor: 100,
        currency: 'USD',
        currencyExponent: 2,
        effectiveAt: '2026-01-01T00:00:00.000Z',
        recordedAt: '2026-01-01T00:00:01.000Z',
        source: 'manual',
      }).success,
    ).toBe(true);
    expect(
      manualFinanceTransactionInputSchema.safeParse({
        amountMinor: -100,
        transactedAt: '2026-01-01T00:00:00.000Z',
        description: 'Fixture',
      }).success,
    ).toBe(true);
    expect(
      csvImportChunkInputSchema.safeParse({
        batchId: id,
        fileDigest: 'a'.repeat(64),
        mapping: {
          dateColumn: 'Date',
          descriptionColumn: 'Description',
          dateFormat: 'YYYY-MM-DD',
          amountMapping: { mode: 'signed', amountColumn: 'Amount' },
        },
        duplicateDecisionDigest: 'b'.repeat(64),
        duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
        chunkIndex: 0,
        finalChunk: true,
        rows: [
          {
            ordinal: 1,
            amountMinor: -100,
            transactedAt: '2026-01-01T00:00:00.000Z',
            description: 'Fixture',
            duplicateDisposition: 'not-suspected',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('never serializes credentials in connection or import-job responses', () => {
    expect(
      financeConnectionSchema.safeParse({
        id,
        scope: { type: 'owner', ownerId: 'owner-1' },
        provider: 'simplefin-bridge',
        status: 'active',
        version: 1,
        encryptedAccessUrl: 'secret',
      }).success,
    ).toBe(false);
    expect(
      importJobSchema.safeParse({
        id,
        connectionId: id,
        status: 'queued',
        counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
        attempts: 0,
      }).success,
    ).toBe(true);
  });
});
