import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  job: {
    id: '01J00000000000000000000000',
    requestedByPrincipal: 'iam-operator',
    status: 'pending',
    snapshotTime: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as any,
}));
vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: class {
    send = mocks.send;
  },
  StartExecutionCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock('../../apps/api/src/exports/export-service.js', () => ({
  startExport: vi.fn(async () => mocks.job),
  findExportJob: vi.fn(async () => mocks.job),
  publicExportJob: (job: unknown) => job,
}));
vi.mock('../../apps/api/src/exports/result-service.js', () => ({
  acknowledgeExport: vi.fn(async (job: any) => ({ ...job, status: 'acknowledged' })),
  readyExportResult: vi.fn(async () => ({
    downloadUrl: 'https://download.invalid',
    manifest: { rowCount: 0, byteLength: 0, sha256: 'a'.repeat(64) },
  })),
}));
import { handler } from '../../apps/api/src/exports/coordinator-handler.js';
describe('export command invocation contract', () => {
  beforeEach(() => vi.clearAllMocks());
  it('starts one exact-snapshot workflow with a stable envelope', async () => {
    const result = (await handler(
      { version: 'naaseh.export-todos/v1', action: 'start', idempotencyKey: 'request-1' } as any,
      {} as any,
      () => undefined,
    )) as any;
    expect(result.version).toBe('naaseh.export-todos-result/v1');
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('supports status and acknowledgement without exposing unknown jobs', async () => {
    const status = (await handler(
      { version: 'naaseh.export-todos/v1', action: 'status', jobId: mocks.job.id } as any,
      {} as any,
      () => undefined,
    )) as any;
    expect(status.job.id).toBe(mocks.job.id);
    const invalid = (await handler(
      { version: 'wrong', action: 'status' } as any,
      {} as any,
      () => undefined,
    )) as any;
    expect(invalid.error.code).toBe('invalid_request');
  });
});
