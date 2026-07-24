import { z } from 'zod';
import { ulidSchema } from './primitives.js';

export const groupPinSchema = z
  .string()
  .regex(/^\d{6,32}$/, 'A group PIN must contain 6–32 digits.');

export const groupSchema = z
  .object({
    id: ulidSchema,
    name: z.string().trim().min(1).max(100),
    ownerId: z.string().min(1),
    joinPinHash: z.string().min(1).optional(),
    status: z.enum(['active', 'archived']).default('active'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    version: z.number().int().positive().default(1),
  })
  .strict();

export const membershipSchema = z
  .object({
    groupId: ulidSchema,
    userId: z.string().min(1),
    role: z.enum(['owner', 'manager', 'member']),
    status: z.enum(['active', 'revoked']),
    joinedAt: z.string().datetime(),
    joinedBy: z.string().min(1),
    revokedAt: z.string().datetime().optional(),
    version: z.number().int().positive().default(1),
  })
  .strict()
  .superRefine((membership, context) => {
    if (membership.status === 'revoked' && !membership.revokedAt)
      context.addIssue({
        code: 'custom',
        path: ['revokedAt'],
        message: 'Revoked memberships require a revocation timestamp.',
      });
    if (membership.status === 'active' && membership.revokedAt)
      context.addIssue({
        code: 'custom',
        path: ['revokedAt'],
        message: 'Active memberships cannot retain a revocation timestamp.',
      });
  });

export type GroupRecord = z.infer<typeof groupSchema>;
export type GroupMembership = z.infer<typeof membershipSchema>;
export interface GroupView {
  id: string;
  name: string;
  ownerId: string;
  status: GroupRecord['status'];
  hasJoinPin: boolean;
  joined: boolean;
  role?: GroupMembership['role'];
  version: number;
}

export interface GroupMembershipView {
  groupId: string;
  userId: string;
  role: GroupMembership['role'];
  status: GroupMembership['status'];
  joinedAt: string;
  revokedAt?: string;
  version: number;
}

/** Return a client-safe group representation; the verifier is intentionally never spread. */
export function publicGroup(group: GroupRecord, membership?: GroupMembership): GroupView {
  return {
    id: group.id,
    name: group.name,
    ownerId: group.ownerId,
    status: group.status,
    hasJoinPin: Boolean(group.joinPinHash),
    joined: membership?.status === 'active',
    ...(membership?.status === 'active' ? { role: membership.role } : {}),
    version: group.version,
  };
}

/** Exclude internal acceptance/audit fields from ordinary membership responses. */
export function publicMembership(membership: GroupMembership): GroupMembershipView {
  return {
    groupId: membership.groupId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt,
    ...(membership.revokedAt ? { revokedAt: membership.revokedAt } : {}),
    version: membership.version,
  };
}
