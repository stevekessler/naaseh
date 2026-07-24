import type { Attachment } from '@naaseh/domain';
import { contentAudiences, appendAudienceChange } from '../sync/change-feed-repository.js';
import { findTask } from '../tasks/task-repository.js';
import { findList, findListItem } from '../lists/list-repository.js';
export async function publishAttachmentChange(value: Attachment) {
  let audiences: string[] = [];
  if (value.parentType === 'task') {
    const task = await findTask(value.parentId);
    if (task)
      audiences = contentAudiences({
        entityId: task.id,
        ownerId: task.ownerId,
        locked: task.visibility === 'private',
      });
  } else {
    const item = await findListItem(value.parentId),
      list = item ? await findList(item.listId) : undefined;
    if (list)
      audiences = contentAudiences({
        entityId: list.id,
        ownerId: list.ownerId,
        locked: list.locked,
        ...(list.groupId ? { groupId: list.groupId } : {}),
      });
  }
  await Promise.all(
    audiences.map((audience) =>
      appendAudienceChange({
        audience,
        entityType: 'attachment',
        entityId: value.id,
        version: value.version,
        operation: value.status === 'deleted' ? 'tombstone' : 'upsert',
        ...(value.status === 'deleted' ? {} : { payload: value }),
        changedAt: value.updatedAt,
      }),
    ),
  );
}
