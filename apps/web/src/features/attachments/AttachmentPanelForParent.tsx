import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listAttachmentMetadata } from '../../db/attachment-repository.js';
import { AttachmentPanel } from './AttachmentPanel.js';
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
  return (
    <AttachmentPanel
      parentType={parentType}
      parentId={parentId}
      items={items}
      csrfToken={csrfToken}
      changed={() => setRevision((value) => value + 1)}
    />
  );
}
