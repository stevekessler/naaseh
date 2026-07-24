import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportJobSchema, transitionExportJob } from '@naaseh/domain';
describe('export workflow recovery', () => {
  it('pins DynamoDB export to the requested snapshot and cleans every object version', () => {
    const infra = readFileSync(new URL('../../infra/lib/export-stack.ts', import.meta.url), 'utf8');
    const cleanup = readFileSync(
      new URL('../../apps/api/src/exports/result-service.ts', import.meta.url),
      'utf8',
    );
    expect(infra).toContain("ExportTime: sfn.JsonPath.numberAt('$.snapshotEpochSeconds')");
    expect(infra).toContain('RetainResultUnderTwentyFourHours');
    expect(cleanup).toContain('ListObjectVersionsCommand');
    expect(cleanup).toContain('VersionId');
  });
  it('keeps unknown outcomes retry-safe and expires only ready results', () => {
    const job = exportJobSchema.parse({
      id: '01J00000000000000000000000',
      requestedByPrincipal: 'operator',
      status: 'pending',
      snapshotTime: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(() => transitionExportJob(job, 'expired')).toThrow();
    expect(transitionExportJob(job, 'failed', { failureCode: 'snapshot' }).failureCode).toBe(
      'snapshot',
    );
  });
});
