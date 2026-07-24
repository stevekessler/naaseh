import { describe, expect, it } from 'vitest';
import {
  groupCreateSchema,
  groupDetailResponseSchema,
  groupJoinSchema,
  groupListResponseSchema,
  groupMembershipViewSchema,
  groupViewSchema,
  taskCreateSchema,
} from '@naaseh/contracts';
import { groupSchema, publicGroup } from '@naaseh/domain';

describe('group and privacy contracts', () => {
  const groupId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  it('keeps create/join PIN fields write-only and rejects unexpected input', () => {
    expect(groupCreateSchema.parse({ name: 'Family', joinPin: '123456' })).toEqual({
      name: 'Family',
      joinPin: '123456',
    });
    expect(groupJoinSchema.safeParse({ pin: '12345' }).success).toBe(false);
    expect(groupJoinSchema.safeParse({ pin: '123456', leak: true }).success).toBe(false);
    const group = groupSchema.parse({
      id: groupId,
      name: 'Family',
      ownerId: 'steve',
      joinPinHash: 'verifier',
      createdAt: new Date().toISOString(),
    });
    expect(JSON.stringify(publicGroup(group))).not.toContain('verifier');
  });

  it('aligns safe create, discover, join, detail, and membership response shapes', () => {
    const view = {
      id: groupId,
      name: 'Family',
      ownerId: 'steve',
      status: 'active' as const,
      hasJoinPin: true,
      joined: true,
      role: 'owner' as const,
      version: 1,
    };
    const membership = {
      groupId: view.id,
      userId: 'steve',
      role: 'owner' as const,
      status: 'active' as const,
      joinedAt: new Date().toISOString(),
      version: 1,
    };
    expect(groupViewSchema.parse(view)).toEqual(view);
    expect(groupListResponseSchema.parse({ items: [view] })).toEqual({ items: [view] });
    expect(groupMembershipViewSchema.parse(membership)).toEqual(membership);
    expect(groupDetailResponseSchema.parse({ group: view, members: [membership] })).toEqual({
      group: view,
      members: [membership],
    });
    for (const value of [view, membership]) {
      expect(value).not.toHaveProperty('pin');
      expect(value).not.toHaveProperty('joinPin');
      expect(value).not.toHaveProperty('joinPinHash');
    }
  });

  it('accepts public/private tasks with an organizational group association', () => {
    expect(
      taskCreateSchema.parse({ label: 'Shared', groupId, visibility: 'public' }),
    ).toMatchObject({ groupId, visibility: 'public' });
    expect(taskCreateSchema.parse({ label: 'Owner only', visibility: 'private' })).toMatchObject({
      visibility: 'private',
    });
  });
});
