import { describe, expect, it } from 'vitest';
import { copyJobSchema, deterministicCopyId, transitionCopyJob } from '@naaseh/domain';
describe('resumable list copy checkpoints', () => {
  it('keeps deterministic children hidden until every checkpoint is complete', () => {
    const base = copyJobSchema.parse({
      id: '01J00000000000000000000000',
      sourceListId: '01J00000000000000000000001',
      sourceVersion: 1,
      destinationListId: '01J00000000000000000000002',
      requestedBy: 'owner',
      status: 'pending',
      itemCount: 2,
      copiedCount: 0,
      attachmentCount: 1,
      linkedCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const copying = transitionCopyJob(base, 'copying', { copiedCount: 1, checkpoint: 'source-1' });
    expect(copying.status).toBe('copying');
    expect(() => transitionCopyJob(copying, 'ready')).toThrow();
    expect(deterministicCopyId(base.id, 'source-1')).toBe(deterministicCopyId(base.id, 'source-1'));
    const ready = transitionCopyJob(copying, 'ready', { copiedCount: 2, linkedCount: 1 });
    expect(ready.status).toBe('ready');
  });
});
