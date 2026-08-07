import { z } from 'zod';
import { createUlid, ulidSchema } from './primitives.js';
import {
  amountMinorSchema,
  directorySnapshotSchema,
  valueOverrideSchema,
} from './directory-item.js';
import { defaultUrgency, urgencySchema } from './urgency.js';

export const listSchema = z
  .object({
    id: ulidSchema,
    ownerId: z.string().min(1),
    name: z.string().trim().min(1).max(300),
    groupId: z.string().min(1).optional(),
    projectId: ulidSchema.optional(),
    locked: z.boolean(),
    urgency: urgencySchema.default(defaultUrgency),
    status: z.enum(['active', 'archived']),
    lifecycle: z.enum(['active', 'archived', 'deleting']).optional(),
    archiveReason: z.enum(['finished', 'manual']).optional(),
    archivedAt: z.string().datetime().optional(),
    archivedBy: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict();
export type List = z.infer<typeof listSchema>;

export const listInputSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    groupId: z.string().min(1).optional(),
    projectId: ulidSchema.optional(),
    urgency: urgencySchema.default(defaultUrgency),
  })
  .strict();
export type ListInput = z.input<typeof listInputSchema>;

export const listItemSchema = z
  .object({
    id: ulidSchema,
    listId: ulidSchema,
    orderKey: z.string().min(1).max(128),
    status: z.enum(['open', 'completed', 'removed']),
    directoryItemId: ulidSchema.optional(),
    directorySnapshot: directorySnapshotSchema,
    nameOverride: z.string().trim().min(1).max(300).optional(),
    valueOverride: valueOverrideSchema.optional(),
    completedAt: z.string().datetime().optional(),
    completedBy: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((item, context) => {
    if ((item.status === 'completed') !== Boolean(item.completedAt && item.completedBy))
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Completion metadata must match status.',
      });
  });
export type ListItem = z.infer<typeof listItemSchema>;

export function createList(input: ListInput, ownerId: string, now = new Date()): List {
  const timestamp = now.toISOString();
  const parsed = listInputSchema.parse(input);
  return listSchema.parse({
    id: createUlid(now.getTime()),
    ownerId,
    name: parsed.name,
    ...(parsed.groupId ? { groupId: parsed.groupId } : {}),
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
    urgency: parsed.urgency,
    locked: false,
    status: 'active',
    lifecycle: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
}

export function orderKeyAfter(last?: string): string {
  const value = last ? Number.parseInt(last, 10) + 10 : 10;
  if (!Number.isSafeInteger(value)) throw new Error('List ordering requires rebalance.');
  return String(value).padStart(12, '0');
}

export function createListItem(
  listId: string,
  input: {
    name: string;
    amountMinor?: number | null;
    directoryItemId?: string;
    directoryVersion?: number;
  },
  actorId: string,
  lastOrderKey?: string,
  now = new Date(),
): ListItem {
  const timestamp = now.toISOString();
  return listItemSchema.parse({
    id: createUlid(now.getTime()),
    listId,
    orderKey: orderKeyAfter(lastOrderKey),
    status: 'open',
    ...(input.directoryItemId ? { directoryItemId: input.directoryItemId } : {}),
    directorySnapshot: {
      name: input.name,
      amountMinor: input.amountMinor ?? null,
      version: input.directoryVersion ?? 1,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
}

export function transitionListItem(
  item: ListItem,
  status: ListItem['status'],
  actorId: string,
  now = new Date(),
): ListItem {
  const timestamp = now.toISOString();
  return listItemSchema.parse({
    ...item,
    status,
    updatedAt: timestamp,
    version: item.version + 1,
    ...(status === 'completed'
      ? { completedAt: timestamp, completedBy: actorId }
      : { completedAt: undefined, completedBy: undefined }),
  });
}

function transitionListLifecycle(
  list: List,
  lifecycle: 'active' | 'archived',
  actorId: string,
  reason: 'finished' | 'manual' | undefined,
  now = new Date(),
): List {
  const current = list.lifecycle ?? list.status;
  if (current === lifecycle) throw new Error(`List is already ${lifecycle}.`);
  const timestamp = now.toISOString();
  return listSchema.parse({
    ...list,
    status: lifecycle,
    lifecycle,
    ...(lifecycle === 'archived'
      ? { archiveReason: reason, archivedAt: timestamp, archivedBy: actorId }
      : {
          archiveReason: undefined,
          archivedAt: undefined,
          archivedBy: undefined,
        }),
    updatedAt: timestamp,
    version: list.version + 1,
  });
}

export const finishList = (list: List, actorId: string, now = new Date()) =>
  transitionListLifecycle(list, 'archived', actorId, 'finished', now);

export const archiveList = (list: List, actorId: string, now = new Date()) =>
  transitionListLifecycle(list, 'archived', actorId, 'manual', now);

export const restoreList = (list: List, actorId: string, now = new Date()) =>
  transitionListLifecycle(list, 'active', actorId, undefined, now);
export function moveListItem(item: ListItem, orderKey: string, now = new Date()): ListItem {
  return listItemSchema.parse({
    ...item,
    orderKey,
    updatedAt: now.toISOString(),
    version: item.version + 1,
  });
}
export function listTotal(
  items: readonly ListItem[],
  current: ReadonlyMap<string, { name: string; amountMinor: number | null }> = new Map(),
): number {
  return items
    .filter((i) => i.status !== 'removed')
    .reduce((sum, item) => {
      const value =
        item.valueOverride?.kind === 'none'
          ? null
          : item.valueOverride?.kind === 'amount'
            ? item.valueOverride.amountMinor
            : ((item.directoryItemId
                ? current.get(item.directoryItemId)?.amountMinor
                : undefined) ?? item.directorySnapshot.amountMinor);
      const next = sum + (value ?? 0);
      if (!amountMinorSchema.safeParse(next).success)
        throw new Error('List total is outside supported range.');
      return next;
    }, 0);
}
