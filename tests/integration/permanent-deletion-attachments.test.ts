import { describe, expect, it, vi } from 'vitest';
import { purgeAttachmentVersions } from '../../apps/api/src/attachments/deletion-service.js';

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
  });
});
