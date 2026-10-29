import { describe, expect, it } from 'vitest';
import { redact } from '@naaseh/observability';
import { financeMetric } from '../../apps/api/src/finance/telemetry.js';

describe('Finance observability redaction', () => {
  it('retains operational dimensions while removing protected finance content and credentials', () => {
    expect(
      redact({
        operation: 'finance.import',
        outcome: 'partial',
        durationMs: 125,
        accountId: 'account-secret',
        accessUrl: 'https://user:password@bridge.example',
        setupToken: 'setup-secret',
        amountMinor: -8_425,
        balanceMinor: 125_000,
        description: 'Fixture purchase',
        payee: 'Example Market',
        rawCsv: 'date,amount',
      }),
    ).toEqual({
      operation: 'finance.import',
      outcome: 'partial',
      durationMs: 125,
      accountId: '[REDACTED]',
      accessUrl: '[REDACTED]',
      setupToken: '[REDACTED]',
      amountMinor: '[REDACTED]',
      balanceMinor: '[REDACTED]',
      description: '[REDACTED]',
      payee: '[REDACTED]',
      rawCsv: '[REDACTED]',
    });
  });

  it('emits only bounded operational dimensions', () => {
    expect(financeMetric('csv-import', 'partial', 125, 3)).toEqual({
      operation: 'csv-import',
      outcome: 'partial',
      durationMs: 125,
      itemCount: 3,
    });
    expect(JSON.stringify(financeMetric('simplefin-refresh', 'failed', 5))).not.toMatch(
      /token|url|filename|amount|description/i,
    );
  });
});
