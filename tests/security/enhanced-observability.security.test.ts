import { createLogger } from '@naaseh/observability';
import { describe, expect, it } from 'vitest';

describe('enhanced structured logging allowlist', () => {
  it('retains operational dimensions while permanently redacting content and credentials', () => {
    const lines: string[] = [];
    const protectedValues = {
      name: 'Secret list name',
      memo: 'Secret memo',
      query: 'private search',
      filename: 'medical.pdf',
      checksum: 'sha256-secret',
      objectKey: 'attachments/secret',
      capability: 'download-secret',
      csvValue: 'private export row',
      secret: 'kms-secret',
    };
    createLogger({ VERBOSE_LOGGING: 'true' }, { sink: (line) => lines.push(line) }).info(
      'enhanced-operation',
      {
        correlationId: 'corr-safe',
        operation: 'attachments.scan',
        outcome: 'success',
        ...protectedValues,
      },
    );
    const output = lines.join('');
    expect(output).toContain('corr-safe');
    expect(output).toContain('attachments.scan');
    for (const value of Object.values(protectedValues)) expect(output).not.toContain(value);
  });
});
