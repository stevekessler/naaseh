import { describe, expect, it } from 'vitest';
import { authorizeContent, contentAudienceFor } from '../src/index.js';

const actor = (
  id: string,
  role: 'admin' | 'user' = 'user',
  groupIds: string[] = [],
  active = true,
) => ({
  id,
  role,
  groupIds,
  active,
});

describe('exclusive content audiences', () => {
  it('selects exactly one ordinary audience and an admin mirror', () => {
    expect(contentAudienceFor({ ownerId: 'owner', locked: false })).toEqual({
      ordinary: 'PUBLIC',
      administrator: 'ADMIN',
    });
    expect(
      contentAudienceFor({ ownerId: 'owner', locked: false, groupId: 'group-a' }).ordinary,
    ).toBe('GROUP#group-a');
    expect(
      contentAudienceFor({ ownerId: 'owner', locked: true, groupId: 'group-a' }).ordinary,
    ).toBe('OWNER#owner');
  });

  it('enforces owner/group/lock/admin/inactive boundaries for active and archived reads', () => {
    const input = { ownerId: 'owner', locked: false, groupId: 'group-a' };
    expect(
      authorizeContent({ ...input, actor: actor('member', 'user', ['group-a']) }).allowed,
    ).toBe(true);
    expect(authorizeContent({ ...input, actor: actor('outsider') }).allowed).toBe(false);
    expect(authorizeContent({ ...input, actor: actor('admin', 'admin') })).toEqual({
      allowed: true,
      privileged: true,
    });
    expect(
      authorizeContent({ ...input, actor: actor('inactive', 'user', ['group-a'], false) }).allowed,
    ).toBe(false);
    expect(
      authorizeContent({ ...input, locked: true, actor: actor('member', 'user', ['group-a']) })
        .allowed,
    ).toBe(false);
  });
});
