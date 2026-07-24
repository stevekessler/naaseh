import { describe, expect, it } from 'vitest';
import {
  authorizeContent,
  type ContentPolicyInput,
} from '../../packages/domain/src/authorization.js';

const base: ContentPolicyInput = {
  actor: { id: 'member', role: 'user', active: true, groupIds: ['group-a'] },
  ownerId: 'owner',
  locked: false,
};

describe('central content authorization', () => {
  it('allows active users to read global content but only the owner to mutate it', () => {
    expect(authorizeContent({ ...base, action: 'read' })).toEqual({
      allowed: true,
      privileged: false,
    });
    expect(authorizeContent({ ...base, action: 'edit' }).allowed).toBe(false);
  });

  it('enforces group and locked precedence without disclosing a reason', () => {
    expect(authorizeContent({ ...base, action: 'read', groupId: 'group-a' }).allowed).toBe(true);
    const denied = authorizeContent({ ...base, action: 'read', groupId: 'group-b' });
    expect(denied).toEqual({ allowed: false, privileged: false });
    expect(
      authorizeContent({ ...base, action: 'read', groupId: 'group-a', locked: true }).allowed,
    ).toBe(false);
  });

  it('allows audited admin reads but never implicit edits', () => {
    const actor = { id: 'admin', role: 'admin' as const, active: true, groupIds: [] };
    expect(authorizeContent({ ...base, actor, action: 'read', locked: true })).toEqual({
      allowed: true,
      privileged: true,
    });
    expect(authorizeContent({ ...base, actor, action: 'edit', locked: true }).allowed).toBe(false);
  });

  it('denies inactive actors and always allows the active owner', () => {
    expect(
      authorizeContent({ ...base, actor: { ...base.actor, active: false }, action: 'read' })
        .allowed,
    ).toBe(false);
    expect(
      authorizeContent({
        ...base,
        actor: { id: 'owner', role: 'user', active: true, groupIds: [] },
        action: 'edit',
      }).allowed,
    ).toBe(true);
  });
});
