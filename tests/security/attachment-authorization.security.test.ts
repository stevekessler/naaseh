import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createList, createListItem, createTask } from '@naaseh/domain';
const records = vi.hoisted(() => ({
  task: undefined as any,
  list: undefined as any,
  item: undefined as any,
}));
vi.mock('../../apps/api/src/tasks/task-repository.js', () => ({
  findTask: vi.fn(async () => records.task),
}));
vi.mock('../../apps/api/src/lists/list-repository.js', () => ({
  findList: vi.fn(async () => records.list),
  findListItem: vi.fn(async () => records.item),
}));
import { authorizeAttachmentParent } from '../../apps/api/src/attachments/attachment-authorization.js';
describe('attachment parent-first authorization', () => {
  beforeEach(() => {
    records.task = undefined;
    records.list = undefined;
    records.item = undefined;
  });
  it('allows owner edit and admin read but denies admin/non-owner edit', async () => {
    records.task = { ...createTask({ label: 'Private' }, 'owner'), visibility: 'private' };
    expect(
      await authorizeAttachmentParent(
        'task',
        records.task.id,
        { id: 'owner', role: 'user', active: true, groupIds: [] },
        'edit',
      ),
    ).toBe(true);
    expect(
      await authorizeAttachmentParent(
        'task',
        records.task.id,
        { id: 'admin', role: 'admin', active: true, groupIds: [] },
        'read',
      ),
    ).toBe(true);
    expect(
      await authorizeAttachmentParent(
        'task',
        records.task.id,
        { id: 'admin', role: 'admin', active: true, groupIds: [] },
        'edit',
      ),
    ).toBe(false);
  });
  it('uses the canonical list parent and does not disclose guessed IDs', async () => {
    records.list = createList({ name: 'Group', groupId: 'family' }, 'owner');
    records.item = createListItem(records.list.id, { name: 'Milk' }, 'owner');
    expect(
      await authorizeAttachmentParent(
        'listItem',
        records.item.id,
        { id: 'member', role: 'user', active: true, groupIds: ['family'] },
        'read',
      ),
    ).toBe(true);
    records.item = undefined;
    expect(
      await authorizeAttachmentParent(
        'listItem',
        '01J00000000000000000000009',
        { id: 'member', role: 'user', active: true, groupIds: ['family'] },
        'read',
      ),
    ).toBe(false);
  });
});
