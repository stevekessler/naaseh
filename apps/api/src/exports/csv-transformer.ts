import type { Attachment, Task } from '@naaseh/domain';
export const CSV_HEADERS = [
  'id',
  'parentId',
  'isSubtask',
  'ownerId',
  'label',
  'link',
  'memo',
  'memoHidden',
  'encryptedMemo',
  'createdAt',
  'updatedAt',
  'dueAt',
  'dueTimeZone',
  'assigneeId',
  'categoryId',
  'groupId',
  'visibility',
  'locked',
  'status',
  'completedAt',
  'completedBy',
  'version',
  'attachments',
] as const;
const escape = (value: unknown) => {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const safeAttachments = (items: readonly Attachment[]) =>
  items.map(
    ({
      id,
      originalFilename,
      mediaType,
      sizeBytes,
      status,
      checksumSha256,
      createdAt,
      updatedAt,
    }) => ({
      id,
      originalFilename,
      mediaType,
      sizeBytes,
      status,
      checksumSha256,
      createdAt,
      updatedAt,
    }),
  );
export function transformTodosToCsv(
  tasks: readonly Task[],
  attachments: ReadonlyMap<string, readonly Attachment[]>,
) {
  const rows = [CSV_HEADERS.join(',')];
  for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    const values: Record<(typeof CSV_HEADERS)[number], unknown> = {
      id: task.id,
      parentId: task.parentId ?? '',
      isSubtask: Boolean(task.parentId),
      ownerId: task.ownerId,
      label: task.label,
      link: task.link ?? '',
      memo: task.memoHidden ? '' : task.memo,
      memoHidden: task.memoHidden,
      encryptedMemo: task.encryptedMemo ?? '',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      dueAt: task.dueAt ?? '',
      dueTimeZone: task.dueTimeZone ?? '',
      assigneeId: task.assigneeId ?? '',
      categoryId: task.categoryId ?? '',
      groupId: task.groupId ?? '',
      visibility: task.visibility,
      locked: task.visibility === 'private',
      status: task.status,
      completedAt: task.completedAt ?? '',
      completedBy: task.completedBy ?? '',
      version: task.version,
      attachments: safeAttachments(attachments.get(task.id) ?? []),
    };
    rows.push(CSV_HEADERS.map((header) => escape(values[header])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
