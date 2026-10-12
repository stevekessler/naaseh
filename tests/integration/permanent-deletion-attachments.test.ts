import { describe, expect, it, vi } from 'vitest';
import { purgeAttachmentVersions } from '../../apps/api/src/attachments/deletion-service.js';
import {
  attachmentPurgeAfter,
  taskAttachmentRetention,
} from '../../apps/api/src/attachments/retention-service.js';

describe('permanent deletion attachment purge', () => {
  it('deletes every exact object version once', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await purgeAttachmentVersions(
      [
        { objectKey: 'attachments/a', objectVersionId: 'v1' },
        { objectKey: 'attachments/a', objectVersionId: 'v1' },
      ],
      remove,
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('attachments/a', 'v1');
    expect(attachmentPurgeAfter('2026-10-12T16:00:00.000Z')).toBe('2026-11-11T16:00:00.000Z');
    expect(
      taskAttachmentRetention({
        status: 'archived',
        lifecycle: 'archived',
        archivedAt: '2026-10-12T16:00:00.000Z',
        updatedAt: '2026-10-12T16:00:00.000Z',
      }),
    ).toEqual({
      purgeAfter: '2026-11-11T16:00:00.000Z',
      retentionReason: 'archived',
    });
    expect(
      taskAttachmentRetention({
        status: 'open',
        lifecycle: 'active',
        updatedAt: '2026-10-12T16:00:00.000Z',
      }),
    ).toBeUndefined();
  });
});
