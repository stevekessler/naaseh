import { describe, expect, it } from 'vitest';
import type { GroupMembership, GroupRecord } from '@naaseh/domain';
import {
  buildCreateGroupTransaction,
  buildJoinGroupTransaction,
  buildRevokeMembershipTransaction,
  buildUpdateMembershipTransaction,
} from '../../src/groups/group-repository.js';

const joinedAt = '2026-07-22T12:00:00.000Z';
const group: GroupRecord = {
  id: 'family',
  name: 'Family',
  ownerId: 'steve',
  status: 'active',
  createdAt: joinedAt,
  updatedAt: joinedAt,
  version: 1,
};
const owner: GroupMembership = {
  groupId: group.id,
  userId: group.ownerId,
  role: 'owner',
  status: 'active',
  joinedAt,
  joinedBy: group.ownerId,
  version: 1,
};

describe('group adjacency transactions', () => {
  it('creates the group and both owner membership views atomically', () => {
    const transaction = buildCreateGroupTransaction(group, owner);
    expect(transaction.TransactItems).toHaveLength(3);
    expect(transaction.TransactItems?.map((item) => item.Put?.Item)).toMatchObject([
      { PK: 'GROUP#family', SK: 'GROUP', GSI1PK: 'GROUP#ACTIVE' },
      { PK: 'GROUP#family', SK: 'MEMBER#steve' },
      { PK: 'USER#steve', SK: 'GROUP#family' },
    ]);
    expect(transaction.TransactItems?.every((item) => item.Put?.ConditionExpression)).toBe(true);
  });

  it('joins and revokes both membership views in the same transaction', () => {
    const member = { ...owner, userId: 'alex', role: 'member' as const };
    const joined = buildJoinGroupTransaction(member);
    expect(joined.TransactItems).toHaveLength(2);
    expect(joined.TransactItems?.map((item) => item.Put?.Item)).toMatchObject([
      { PK: 'GROUP#family', SK: 'MEMBER#alex', data: { status: 'active' } },
      { PK: 'USER#alex', SK: 'GROUP#family', data: { status: 'active' } },
    ]);

    const revoked = buildRevokeMembershipTransaction(member);
    expect(revoked.TransactItems).toHaveLength(2);
    expect(revoked.TransactItems?.every((item) => item.Put?.Item?.data.status === 'revoked')).toBe(
      true,
    );
    expect(
      revoked.TransactItems?.every(
        (item) => item.Put?.ExpressionAttributeValues?.[':expected'] === 1,
      ),
    ).toBe(true);
  });

  it('conditionally changes both membership role views at the same version', () => {
    const member = { ...owner, userId: 'alex', role: 'member' as const };
    const manager = { ...member, role: 'manager' as const, version: 2 };
    const updated = buildUpdateMembershipTransaction(member, manager);
    expect(updated.TransactItems).toHaveLength(2);
    expect(updated.TransactItems?.every((item) => item.Put?.Item?.data.role === 'manager')).toBe(
      true,
    );
    expect(
      updated.TransactItems?.every(
        (item) => item.Put?.ExpressionAttributeValues?.[':expected'] === 1,
      ),
    ).toBe(true);
  });
});
