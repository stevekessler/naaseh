import { describe, expect, it } from 'vitest';
import { copyJobSchema, deterministicCopyId, transitionCopyJob } from '../src/copy-job.js';
import { exportJobSchema, transitionExportJob } from '../src/export-job.js';

describe('resumable jobs', () => {
  it('derives stable child ids and publishes copies only after completion', () => {
    expect(deterministicCopyId('job', 'source')).toBe(deterministicCopyId('job', 'source'));
    expect(deterministicCopyId('job', 'source')).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(deterministicCopyId('job', 'source')).not.toBe(deterministicCopyId('job', 'other'));
    const job = copyJobSchema.parse({
      id: '01J00000000000000000000000',
      sourceListId: '01J00000000000000000000001',
      sourceVersion: 1,
      destinationListId: '01J00000000000000000000002',
      requestedBy: 'owner',
      status: 'pending',
      itemCount: 2,
      copiedCount: 0,
      attachmentCount: 0,
      linkedCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(transitionCopyJob(job, 'copying').status).toBe('copying');
  });
  it('requires a verified manifest before export is ready', () => {
    const job = exportJobSchema.parse({
      id: '01J00000000000000000000000',
      requestedByPrincipal: 'operator',
      status: 'pending',
      snapshotTime: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(() => transitionExportJob(job, 'ready')).toThrow();
  });
});
