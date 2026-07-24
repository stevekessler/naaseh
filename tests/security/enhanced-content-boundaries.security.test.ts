import { authorizeContent, canReadTaskAs, createList, createTask } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';

const actors = {
  owner: { id: 'owner', role: 'user' as const, active: true, groupIds: ['household'] },
  member: { id: 'member', role: 'user' as const, active: true, groupIds: ['household'] },
  outsider: { id: 'outsider', role: 'user' as const, active: true, groupIds: [] },
  admin: { id: 'admin', role: 'admin' as const, active: true, groupIds: [] },
};

describe('enhanced content authorization boundaries', () => {
  it('applies the same parent-first decision to browse, direct, search, copy, cache, file, and export reads', () => {
    const list = {
      ...createList({ name: 'Private groceries', groupId: 'household' }, 'owner'),
      locked: true,
    };
    for (const operation of ['browse', 'direct', 'search', 'copy', 'cache', 'file', 'export']) {
      expect(
        authorizeContent({
          actor: actors.owner,
          ownerId: list.ownerId,
          locked: list.locked,
          groupId: list.groupId,
        }).allowed,
        operation,
      ).toBe(true);
      expect(
        authorizeContent({
          actor: actors.member,
          ownerId: list.ownerId,
          locked: list.locked,
          groupId: list.groupId,
        }).allowed,
        operation,
      ).toBe(false);
      expect(
        authorizeContent({
          actor: actors.outsider,
          ownerId: list.ownerId,
          locked: list.locked,
          groupId: list.groupId,
        }).allowed,
        operation,
      ).toBe(false);
      expect(
        authorizeContent({
          actor: actors.admin,
          ownerId: list.ownerId,
          locked: list.locked,
          groupId: list.groupId,
        }).allowed,
        operation,
      ).toBe(true);
    }
  });

  it('allows administrators to inspect but never mutate private content', () => {
    const privateTask = createTask({ label: 'Private', visibility: 'private' }, 'owner');
    expect(canReadTaskAs(privateTask, actors.admin)).toMatchObject({
      allowed: true,
      privileged: true,
    });
    expect(
      authorizeContent({ actor: actors.admin, ownerId: 'owner', locked: true, action: 'edit' }),
    ).toEqual({ allowed: false, privileged: false });
    expect(
      authorizeContent({
        actor: { ...actors.admin, active: false },
        ownerId: 'owner',
        locked: false,
      }),
    ).toEqual({ allowed: false, privileged: false });
  });
});
