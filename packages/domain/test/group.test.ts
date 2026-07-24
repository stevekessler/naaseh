import { describe, expect, it } from 'vitest';
import { groupPinSchema, groupSchema, membershipSchema, publicGroup } from '../src/group.js';

describe('group boundaries', () => {
  const at = new Date().toISOString();
  const groupId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  it('accepts numeric group PIN input only at the six-digit minimum', () => {
    expect(groupPinSchema.parse('123456')).toBe('123456');
    expect(groupPinSchema.safeParse('12345').success).toBe(false);
    expect(groupPinSchema.safeParse('secret1').success).toBe(false);
  });

  it('validates lifecycle state and canonical membership roles', () => {
    expect(
      membershipSchema.safeParse({
        groupId,
        userId: 'user-1',
        role: 'manager',
        status: 'active',
        joinedAt: at,
        joinedBy: 'user-1',
      }).success,
    ).toBe(true);
    expect(
      membershipSchema.safeParse({
        groupId,
        userId: 'user-1',
        role: 'member',
        status: 'revoked',
        joinedAt: at,
        joinedBy: 'user-1',
      }).success,
    ).toBe(false);
  });

  it('never exposes a stored join PIN verifier in client group views', () => {
    const group = groupSchema.parse({
      id: groupId,
      name: 'Family',
      ownerId: 'user-1',
      joinPinHash: '$argon2id$protected',
      createdAt: at,
    });
    const view = publicGroup(group);
    expect(view.hasJoinPin).toBe(true);
    expect(view).not.toHaveProperty('joinPinHash');
  });
});
