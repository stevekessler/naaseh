import { createUlid, directoryItemSchema, type GlobalDirectoryItem } from '@naaseh/domain';
export function createDirectoryItem(
  input: { name: string; amountMinor: number | null; currency: string },
  actorId: string,
  now = new Date(),
) {
  const timestamp = now.toISOString();
  return directoryItemSchema.parse({
    id: createUlid(now.getTime()),
    ...input,
    status: 'active',
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
}
export function updateDirectoryItem(
  current: GlobalDirectoryItem,
  patch: Pick<Partial<GlobalDirectoryItem>, 'name' | 'amountMinor' | 'status'>,
  actorId: string,
  now = new Date(),
) {
  if (current.status === 'archived' && patch.status !== 'active')
    throw new Error('Archived directory items cannot be edited.');
  return directoryItemSchema.parse({
    ...current,
    ...patch,
    updatedBy: actorId,
    updatedAt: now.toISOString(),
    version: current.version + 1,
  });
}
