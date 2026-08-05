import { archiveList, finishList, restoreList, type List } from '@naaseh/domain';
import { listAudienceChanges } from '../lists/list-audience.js';
import { findList, saveListLifecycleMutation } from '../lists/list-repository.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';

export interface ListLifecycleRequest {
  listId: string;
  actorId: string;
  mutationId: string;
  expectedVersion: number;
  action: 'finish' | 'archive' | 'restore';
  now?: Date;
}

export async function changeListLifecycle(request: ListLifecycleRequest): Promise<List> {
  const current = await findList(request.listId);
  if (!current || current.ownerId !== request.actorId) throw new Error('List not found.');
  if (current.version !== request.expectedVersion) throw new Error('List version changed.');
  const now = request.now ?? new Date();
  const next =
    request.action === 'finish'
      ? finishList(current, request.actorId, now)
      : request.action === 'archive'
        ? archiveList(current, request.actorId, now)
        : restoreList(current, request.actorId, now);
  const feeds = await Promise.all(listAudienceChanges(current, next).map(prepareAudienceChange));
  await saveListLifecycleMutation(
    next,
    current,
    request.actorId,
    request.mutationId,
    request.action,
    feeds,
  );
  notifyStackMembershipWorkChange(
    'list',
    current,
    next,
    request.action === 'restore' ? 'restore' : 'archive',
  );
  return next;
}
