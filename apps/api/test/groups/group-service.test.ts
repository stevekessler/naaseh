import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupMembership, GroupRecord } from '@naaseh/domain';

const repository = vi.hoisted(() => ({
  getMembership: vi.fn(),
  putGroupWithOwner: vi.fn(),
  putMembership: vi.fn(),
  revokeMembership: vi.fn(),
  updateMembership: vi.fn(),
}));
const password = vi.hoisted(() => ({
  hashPassword: vi.fn(async () => '$argon2id$safe'),
  verifyPassword: vi.fn(async () => true),
}));

vi.mock('../../src/groups/group-repository.js', () => repository);
vi.mock('../../src/auth/password.js', () => password);

import {
  changeGroupMemberRole,
  GroupPolicyError,
  joinGroup,
  removeGroupMember,
} from '../../src/groups/group-service.js';

const at = '2026-07-22T12:00:00.000Z';
const group: GroupRecord = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Family',
  ownerId: 'owner',
  status: 'active',
  createdAt: at,
  version: 1,
};
const member: GroupMembership = {
  groupId: group.id,
  userId: 'member',
  role: 'member',
  status: 'active',
  joinedAt: at,
  joinedBy: 'member',
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe('group membership policy', () => {
  it('returns an already-active membership idempotently without rechecking its PIN', async () => {
    repository.getMembership.mockResolvedValue(member);
    await expect(joinGroup(group, member.userId, undefined, 'pepper')).resolves.toBe(member);
    expect(password.verifyPassword).not.toHaveBeenCalled();
    expect(repository.putMembership).not.toHaveBeenCalled();
  });

  it('does not allow a revoked member to self-reactivate', async () => {
    repository.getMembership.mockResolvedValue({ ...member, status: 'revoked', revokedAt: at });
    await expect(joinGroup(group, member.userId, '123456', 'pepper')).rejects.toMatchObject({
      reason: 'membership_revoked',
    });
    expect(repository.putMembership).not.toHaveBeenCalled();
  });

  it('prevents owner revocation and ownership transfer through membership roles', async () => {
    await expect(removeGroupMember(group, group.ownerId, group.ownerId)).rejects.toBeInstanceOf(
      GroupPolicyError,
    );
    await expect(
      changeGroupMemberRole(group, group.ownerId, group.ownerId, 'manager'),
    ).rejects.toMatchObject({ reason: 'forbidden_membership_change' });
  });

  it('allows only the owner to promote or demote an active non-owner', async () => {
    repository.getMembership.mockResolvedValue(member);
    const promoted = await changeGroupMemberRole(group, group.ownerId, member.userId, 'manager');
    expect(promoted).toMatchObject({ role: 'manager', version: 2 });
    expect(repository.updateMembership).toHaveBeenCalledWith(member, promoted);
    await expect(
      changeGroupMemberRole(group, 'different-user', member.userId, 'member'),
    ).rejects.toMatchObject({ reason: 'forbidden_membership_change' });
  });
});
