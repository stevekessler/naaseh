import { canReadTaskAs, type Attachment } from '@naaseh/domain';
import { findTask } from '../tasks/task-repository.js';
import { findList, findListItem } from '../lists/list-repository.js';
import { authorizeList } from '../lists/list-authorization.js';
export interface AttachmentActor {
  id: string;
  role: 'admin' | 'user';
  active: boolean;
  groupIds: string[];
}
export async function authorizeAttachmentParent(
  parentType: Attachment['parentType'],
  parentId: string,
  actor: AttachmentActor,
  action: 'read' | 'edit',
) {
  if (parentType === 'task') {
    const task = await findTask(parentId);
    if (!task) return false;
    return action === 'read' ? canReadTaskAs(task, actor).allowed : task.ownerId === actor.id;
  }
  const item = await findListItem(parentId);
  if (!item) return false;
  const list = await findList(item.listId);
  return authorizeList(list, actor, action).allowed;
}
