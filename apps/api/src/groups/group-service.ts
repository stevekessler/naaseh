import { createUlid } from '@naaseh/domain';
import { groupPinSchema, groupSchema, membershipSchema, type GroupRecord } from '@naaseh/domain';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  getMembership,
  putGroupWithOwner,
  putMembership,
  revokeMembership,
  updateMembership,
} from './group-repository.js';

export type GroupPolicyFailure =
  | 'group_inactive'
  | 'membership_revoked'
  | 'invalid_join_pin'
  | 'forbidden_membership_change'
  | 'membership_not_active';

export class GroupPolicyError extends Error {
  constructor(readonly reason: GroupPolicyFailure) {
    super('Unable to complete the group operation.');
    this.name = 'GroupPolicyError';
  }
}

export async function createGroup(
  name: string,
  ownerId: string,
  pin: string | undefined,
  pepper: string,
) {
  if (pin !== undefined) groupPinSchema.parse(pin);
  const now = new Date().toISOString();
  const group = groupSchema.parse({
    id: createUlid(),
    name,
    ownerId,
    ...(pin ? { joinPinHash: await hashPassword(pin, pepper) } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const owner = membershipSchema.parse({
    groupId: group.id,
    userId: ownerId,
    role: 'owner',
    status: 'active',
    joinedAt: now,
    joinedBy: ownerId,
  });
  await putGroupWithOwner(group, owner);
  return { group, owner };
}

export async function verifyGroupPin(
  hash: string | undefined,
  pin: string | undefined,
  pepper: string,
) {
  if (!hash) return true;
  if (!pin || !groupPinSchema.safeParse(pin).success) return false;
  return verifyPassword(hash, pin, pepper);
}

export async function joinGroup(
  group: GroupRecord,
  userId: string,
  pin: string | undefined,
  pepper: string | (() => Promise<string>),
) {
  if (group.status !== 'active') throw new GroupPolicyError('group_inactive');
  const existing = await getMembership(group.id, userId);
  if (existing?.status === 'active') return existing;
  // Revocation is terminal in v1. A revoked user cannot silently self-reactivate.
  if (existing?.status === 'revoked') throw new GroupPolicyError('membership_revoked');
  const pepperValue = typeof pepper === 'string' ? pepper : await pepper();
  if (!(await verifyGroupPin(group.joinPinHash, pin, pepperValue)))
    throw new GroupPolicyError('invalid_join_pin');
  const membership = membershipSchema.parse({
    groupId: group.id,
    userId,
    role: 'member',
    status: 'active',
    joinedAt: new Date().toISOString(),
    joinedBy: userId,
  });
  await putMembership(membership);
  return membership;
}

export async function removeGroupMember(group: GroupRecord, actorId: string, userId: string) {
  if (group.ownerId !== actorId || group.ownerId === userId)
    throw new GroupPolicyError('forbidden_membership_change');
  const membership = await getMembership(group.id, userId);
  if (!membership || membership.status !== 'active' || membership.role === 'owner')
    throw new GroupPolicyError('membership_not_active');
  await revokeMembership(membership, {
    audience: `ACCESS#${userId}`,
    entityType: 'accessControl',
    entityId: group.id,
    operation: 'tombstone',
    payload: { kind: 'group-revoked', groupId: group.id },
    changedAt: new Date().toISOString(),
  });
}

export async function changeGroupMemberRole(
  group: GroupRecord,
  actorId: string,
  userId: string,
  role: 'manager' | 'member',
) {
  if (group.ownerId !== actorId || group.ownerId === userId)
    throw new GroupPolicyError('forbidden_membership_change');
  const current = await getMembership(group.id, userId);
  if (!current || current.status !== 'active' || current.role === 'owner')
    throw new GroupPolicyError('membership_not_active');
  if (current.role === role) return current;
  const next = membershipSchema.parse({ ...current, role, version: current.version + 1 });
  await updateMembership(current, next);
  return next;
}
