import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listAttachmentMetadata } from '../../db/attachment-repository.js';
import { AttachmentPanel } from './AttachmentPanel.js';
import { db } from '../../db/database.js';
export function AttachmentPanelForParent({
  parentType,
  parentId,
  csrfToken,
}: {
  parentType: 'task' | 'listItem';
  parentId: string;
  csrfToken: string;
}) {
  const [revision, setRevision] = useState(0);
  const items = useLiveQuery(() => listAttachmentMetadata(parentId), [parentId, revision]) ?? [];
  const awaitingParentSync =
    useLiveQuery(
      async () =>
        parentType === 'task' &&
        (await db.outbox.where('entityId').equals(parentId).toArray()).some(
          (mutation) => mutation.entityType === 'task' && mutation.operation === 'create',
        ),
      [parentId, parentType],
    ) ?? false;
  return (
    <AttachmentPanel
      parentType={parentType}
      parentId={parentId}
      items={items}
      csrfToken={csrfToken}
      awaitingParentSync={awaitingParentSync}
      changed={() => setRevision((value) => value + 1)}
    />
  );
}
