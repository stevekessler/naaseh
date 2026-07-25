import { describe, expect, it } from 'vitest';
import { authorizeContent } from '@naaseh/domain';

describe('archive authorization', () => {
  const user = (id: string, groupIds: string[] = [], active = true) => ({
    id,
    role: 'user' as const,
    active,
    groupIds,
  });

  it('uses current membership for archived group work and rejects revoked/inactive users', () => {
    const input = { ownerId: 'owner', groupId: 'group-a', locked: false };
    expect(authorizeContent({ ...input, actor: user('member', ['group-a']) }).allowed).toBe(true);
    expect(authorizeContent({ ...input, actor: user('member') }).allowed).toBe(false);
    expect(authorizeContent({ ...input, actor: user('member', ['group-a'], false) }).allowed).toBe(
      false,
    );
  });

  it('keeps locked archive owner-only with an audited administrator override', () => {
    expect(authorizeContent({ actor: user('owner'), ownerId: 'owner', locked: true }).allowed).toBe(
      true,
    );
    expect(authorizeContent({ actor: user('other'), ownerId: 'owner', locked: true }).allowed).toBe(
      false,
    );
    expect(
      authorizeContent({
        actor: { id: 'admin', role: 'admin', active: true, groupIds: [] },
        ownerId: 'owner',
        locked: true,
      }).privileged,
    ).toBe(true);
  });
});
