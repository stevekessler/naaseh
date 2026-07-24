export interface MixedSearchFixture {
  id: string;
  type: 'task' | 'list' | 'listItem';
  parentListId?: string;
  text: string;
  visibility: 'public' | 'group' | 'locked';
}

export interface AttachmentFixture {
  id: string;
  parentType: 'task' | 'listItem';
  parentId: string;
  filename: string;
  sizeBytes: number;
  status: 'pending_upload' | 'scanning' | 'available' | 'rejected';
}

export function mixedSearchFixtures(count = 50_000): MixedSearchFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const type = (['task', 'list', 'listItem'] as const)[index % 3];
    const listNumber = Math.floor(index / 3);
    return {
      id: `${type}-${String(index).padStart(6, '0')}`,
      type,
      ...(type === 'listItem'
        ? { parentListId: `list-${String(listNumber).padStart(6, '0')}` }
        : {}),
      text: `fixture item ${index}`,
      visibility: (['public', 'group', 'locked'] as const)[index % 3],
    };
  });
}

export const attachmentFixtures: AttachmentFixture[] = [
  {
    id: 'attachment-clean',
    parentType: 'task',
    parentId: 'task-public',
    filename: 'receipt.pdf',
    sizeBytes: 1_024,
    status: 'available',
  },
  {
    id: 'attachment-scanning',
    parentType: 'listItem',
    parentId: 'list-item-private',
    filename: 'photo.png',
    sizeBytes: 2_048,
    status: 'scanning',
  },
];
