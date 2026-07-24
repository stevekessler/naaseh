import { describe, expect, it } from 'vitest';
import { exportJobSchema, transitionExportJob } from '../src/export-job.js';
const base = exportJobSchema.parse({
  id: '01J00000000000000000000000',
  requestedByPrincipal: 'operator',
  status: 'pending',
  snapshotTime: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
describe('export job lifecycle', () => {
  it('requires a verified stable manifest before ready', () => {
    const exporting = transitionExportJob(base, 'exporting');
    const transforming = transitionExportJob(exporting, 'transforming');
    expect(() => transitionExportJob(transforming, 'ready')).toThrow();
    const ready = transitionExportJob(transforming, 'ready', {
      manifest: { rowCount: 2, byteLength: 20, sha256: 'a'.repeat(64) },
      resultKey: 'exports/result.csv',
      downloadExpiresAt: '2026-01-01T00:01:00.000Z',
    });
    expect(ready.status).toBe('ready');
    expect(transitionExportJob(ready, 'expired', { failureCode: 'expired' }).failureCode).toBe(
      'expired',
    );
  });
  it('rejects unsafe failure codes and invalid transitions', () => {
    expect(() =>
      exportJobSchema.parse({ ...base, status: 'failed', failureCode: 'internal-stack' }),
    ).toThrow();
    expect(() => transitionExportJob(base, 'ready')).toThrow();
  });
});
