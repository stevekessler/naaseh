import { describe, expect, it } from 'vitest';
import { createList, deterministicCopyId } from '../src/index.js';
import { authorizeList } from '../../../apps/api/src/lists/list-authorization.js';

describe('list visibility and copy identity', () => {
  const actor = (id: string, role: 'admin' | 'user' = 'user', groupIds: string[] = []) => ({
    id,
    role,
    groupIds,
    active: true,
  });
  it('applies lock precedence while preserving the selected group and admin read-only access', () => {
    const list = { ...createList({ name: 'Family', groupId: 'family' }, 'owner'), locked: true };
    expect(list.groupId).toBe('family');
    expect(authorizeList(list, actor('member', 'user', ['family'])).allowed).toBe(false);
    expect(authorizeList(list, actor('admin', 'admin')).allowed).toBe(true);
    expect(authorizeList(list, actor('admin', 'admin'), 'edit').allowed).toBe(false);
    expect(authorizeList(list, actor('owner'), 'edit').allowed).toBe(true);
  });
  it('derives independent stable copy identities', () => {
    expect(deterministicCopyId('job', 'item')).toBe(deterministicCopyId('job', 'item'));
    expect(deterministicCopyId('job', 'item')).not.toBe(deterministicCopyId('other', 'item'));
  });
});
