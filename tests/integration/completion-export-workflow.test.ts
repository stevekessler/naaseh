import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportJobSchema, transitionExportJob } from '@naaseh/domain';

describe('completion export workflow', () => {
  it('keeps snapshot, integrity, private storage, and resumable idempotency gates explicit', () => {
    const workflow = readFileSync('apps/api/src/exports/workflow-handler.ts', 'utf8');
    const result = readFileSync('apps/api/src/exports/result-service.ts', 'utf8');
    const coordinator = readFileSync('apps/api/src/exports/coordinator-handler.ts', 'utf8');
    expect(workflow).toContain('validateCompletedTaskCsv');
    expect(workflow).toContain('ChecksumSHA256');
    expect(result).toContain('HeadObjectCommand');
    expect(coordinator).toContain('ExecutionAlreadyExists');
  });

  it('never presents an interrupted transformation as a completed result', () => {
    const job = exportJobSchema.parse({
      id: '01J00000000000000000000000',
      requestedByPrincipal: 'owner',
      exportKind: 'completed_tasks',
      schemaVersion: 'naaseh.completed-tasks/v1',
      status: 'transforming',
      snapshotTime: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const failed = transitionExportJob(job, 'failed', { failureCode: 'verification' });
    expect(failed.status).toBe('failed');
    expect(failed.manifest).toBeUndefined();
    expect(() => transitionExportJob(failed, 'ready')).toThrow();
  });
});
