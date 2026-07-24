import { describe, expect, it } from 'vitest';
import { copyJobResponseSchema, listPatchSchema } from '@naaseh/contracts';
describe('list sharing and copy contracts', () => {
  it('accepts group and locked transitions and caller-owned progress', () => {
    expect(listPatchSchema.parse({ groupId: 'family', locked: false })).toEqual({
      groupId: 'family',
      locked: false,
    });
    const job = {
      id: '01J00000000000000000000000',
      sourceListId: '01J00000000000000000000001',
      sourceVersion: 1,
      destinationListId: '01J00000000000000000000002',
      requestedBy: 'owner',
      status: 'copying',
      itemCount: 3,
      copiedCount: 2,
      attachmentCount: 1,
      linkedCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    };
    expect(copyJobResponseSchema.parse(job)).toMatchObject({ status: 'copying', copiedCount: 2 });
  });
});
