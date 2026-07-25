import {
  createList,
  createListItem,
  listSchema,
  listItemSchema,
  transitionListItem,
  type List,
  type ListItem,
} from '@naaseh/domain';
export const createOwnedList = (
  name: string,
  actorId: string,
  now = new Date(),
  projectId?: string,
) => createList({ name, ...(projectId ? { projectId } : {}) }, actorId, now);
export function updateOwnedList(
  current: List,
  patch: Pick<Partial<List>, 'name' | 'groupId' | 'locked' | 'status' | 'projectId'>,
  actorId: string,
  now = new Date(),
) {
  if (current.ownerId !== actorId) throw new Error('Only the owner may change this list.');
  return listSchema.parse({
    ...current,
    ...patch,
    updatedAt: now.toISOString(),
    version: current.version + 1,
  });
}
export const addOwnedListItem = (
  list: List,
  input: Parameters<typeof createListItem>[1],
  actorId: string,
  last?: string,
  now = new Date(),
) => {
  if (list.ownerId !== actorId) throw new Error('Only the owner may change this list.');
  return createListItem(list.id, input, actorId, last, now);
};
export function updateOwnedListItem(
  list: List,
  current: ListItem,
  patch: Partial<ListItem>,
  actorId: string,
  now = new Date(),
) {
  if (list.ownerId !== actorId || current.listId !== list.id)
    throw new Error('Only the owner may change this list.');
  if (patch.status && patch.status !== current.status)
    return transitionListItem(current, patch.status, actorId, now);
  return listItemSchema.parse({
    ...current,
    ...patch,
    updatedAt: now.toISOString(),
    version: current.version + 1,
  });
}
