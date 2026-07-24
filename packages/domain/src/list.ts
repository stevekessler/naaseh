import { z } from 'zod';
import { createUlid, ulidSchema } from './primitives.js';
import {
  amountMinorSchema,
  directorySnapshotSchema,
  valueOverrideSchema,
} from './directory-item.js';

export const listSchema = z
  .object({
    id: ulidSchema,
    ownerId: z.string().min(1),
    name: z.string().trim().min(1).max(300),
    groupId: z.string().min(1).optional(),
    locked: z.boolean(),
    status: z.enum(['active', 'archived']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict();
export type List = z.infer<typeof listSchema>;

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

export function createList(
  input: { name: string; groupId?: string },
  ownerId: string,
  now = new Date(),
): List {
  const timestamp = now.toISOString();
  return listSchema.parse({
    id: createUlid(now.getTime()),
    ownerId,
    name: input.name,
    ...(input.groupId ? { groupId: input.groupId } : {}),
    locked: false,
    status: 'active',
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
