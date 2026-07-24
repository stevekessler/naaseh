import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('export security boundary', () => {
  it('uses IAM-only invocation, private KMS storage, and content-free logs', () => {
    const infra = readFileSync(new URL('../../infra/lib/export-stack.ts', import.meta.url), 'utf8');
    const worker = readFileSync(
      new URL('../../apps/api/src/exports/workflow-handler.ts', import.meta.url),
      'utf8',
    );
    expect(infra).toContain("actions: ['lambda:InvokeFunction']");
    expect(infra).toContain('blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL');
    expect(infra).toContain('encryption: s3.BucketEncryption.KMS');
    expect(worker).not.toMatch(/log\([^\n]*(label|memo|filename|checksum)/i);
  });
  it('does not grant the operator direct S3, DynamoDB, KMS, or workflow access', () => {
    const infra = readFileSync(new URL('../../infra/lib/export-stack.ts', import.meta.url), 'utf8');
    const policy = infra.slice(infra.indexOf('createExportOperatorPolicy'));
    expect(policy).not.toMatch(/s3:|dynamodb:|kms:|states:/i);
  });
});
