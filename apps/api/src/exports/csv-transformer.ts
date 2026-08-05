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
  'projectId',
  'urgency',
  'overallRank',
  'projectRank',
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
  viewerRanks: ReadonlyMap<
    string,
    { overallRank?: number; projectRank?: number; viewerId?: string }
  > = new Map(),
) {
  const rows = [CSV_HEADERS.join(',')];
  for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    const active = task.status === 'open' && (task.lifecycle ?? 'active') === 'active';
    const ranks = active ? viewerRanks.get(task.id) : undefined;
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
      projectId: task.projectId ?? '',
      urgency: task.urgency,
      overallRank: ranks?.overallRank ?? '',
      projectRank: ranks?.projectRank ?? '',
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
