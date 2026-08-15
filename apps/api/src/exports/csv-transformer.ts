import type { Attachment, Task } from '@naaseh/domain';
import { COMPLETED_TASK_CSV_HEADERS, COMPLETED_TASK_CSV_SCHEMA_VERSION } from '@naaseh/contracts';

export const CSV_HEADERS = COMPLETED_TASK_CSV_HEADERS;

export interface CompletionExportMetadata {
  categoryLabel?: string;
  projectLabel?: string;
  groupLabel?: string;
  rootTaskId?: string;
  completionReversedAt?: string;
  completionVersion?: number;
  sharedWith?: unknown[];
  lockedByUserId?: string;
  recurrence?: unknown;
  reminders?: unknown[];
  listId?: string;
  listItemId?: string;
  listAmountMinor?: number;
  effectivePostItColor?: string;
  googleTaskId?: string;
  googleTaskListId?: string;
  googleSyncState?: string;
  googleLastSyncedAt?: string;
  syncState?: string;
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
};

export const stableJson = (value: unknown) => JSON.stringify(stableValue(value));

const neutralizeFormula = (text: string) => {
  const first = [...text].find(
    (character) => !/\s/u.test(character) && character.charCodeAt(0) > 31,
  );
  return first && '=+-@'.includes(first) ? `'${text}` : text;
};

export const csvCell = (value: unknown) => {
  const raw =
    value == null
      ? ''
      : typeof value === 'string'
        ? neutralizeFormula(value)
        : typeof value === 'object'
          ? stableJson(value)
          : String(value);
  return /[",\r\n]/u.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
};

function parseCsvRecords(csv: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && character === ',') {
      record.push(field);
      field = '';
    } else if (!quoted && character === '\r' && csv[index + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      index += 1;
    } else field += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function validateCompletedTaskCsv(csv: string, expectedRows: number) {
  const records = parseCsvRecords(csv);
  if (records.length !== expectedRows + 1) throw new Error('CSV row count verification failed.');
  if (records[0]?.join(',') !== CSV_HEADERS.join(','))
    throw new Error('CSV header verification failed.');
  if (records.some((record) => record.length !== CSV_HEADERS.length))
    throw new Error('CSV field count verification failed.');
  if (records.slice(1).some((record) => record[0] !== COMPLETED_TASK_CSV_SCHEMA_VERSION))
    throw new Error('CSV schema version verification failed.');
  return { rowCount: expectedRows, fieldCount: CSV_HEADERS.length };
}

const safeAttachments = (items: readonly Attachment[]) =>
  [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, originalFilename, mediaType, sizeBytes, status, createdAt, updatedAt }) => ({
      id,
      originalFilename,
      mediaType,
      sizeBytes,
      status,
      createdAt,
      updatedAt,
    }));

const duePrecision = (task: Task) => {
  if (task.dueKind === 'date') return 'date';
  if (!task.dueAt) return '';
  const instant = new Date(task.dueAt);
  return instant.getUTCMinutes() % 5 === 0 && instant.getUTCSeconds() === 0
    ? 'five_minute'
    : 'legacy_off_grid';
};

function rootTaskId(task: Task, tasks: ReadonlyMap<string, Task>, explicit?: string) {
  if (explicit) return explicit;
  let current = task;
  const seen = new Set([task.id]);
  while (current.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = tasks.get(current.parentId);
    if (!parent) return current.parentId;
    current = parent;
  }
  return current.id;
}

export function transformCompletedTasksToCsv(
  tasks: readonly Task[],
  attachments: ReadonlyMap<string, readonly Attachment[]>,
  options: {
    asOf: string;
    metadata?: ReadonlyMap<string, CompletionExportMetadata>;
    viewerRanks?: ReadonlyMap<string, { overallRank?: number; projectRank?: number }>;
  },
) {
  const rows = [CSV_HEADERS.join(',')];
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  for (const task of [...tasks].sort((left, right) => left.id.localeCompare(right.id))) {
    const metadata = options.metadata?.get(task.id) ?? {};
    const ranks =
      (task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active')) === 'active'
        ? options.viewerRanks?.get(task.id)
        : undefined;
    const memoProtected = task.memoHidden;
    const values: Record<(typeof CSV_HEADERS)[number], unknown> = {
      schema_version: COMPLETED_TASK_CSV_SCHEMA_VERSION,
      export_as_of: options.asOf,
      record_kind: task.parentId ? 'subtask' : 'task',
      task_id: task.id,
      parent_task_id: task.parentId ?? '',
      root_task_id: rootTaskId(task, taskMap, metadata.rootTaskId),
      label: task.label,
      link: task.link ?? '',
      memo_text: memoProtected ? '' : task.memo,
      memo_document_json: memoProtected || !task.memoDocument ? '' : stableJson(task.memoDocument),
      memo_protected: memoProtected,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      due_kind: task.dueKind ?? '',
      due_date: task.dueDate ?? '',
      due_at: task.dueAt ?? '',
      due_time_precision: duePrecision(task),
      completed_at: task.completedAt ?? '',
      completion_event_id: task.currentCompletionEventId ?? '',
      completed_by_user_id: task.completedBy ?? '',
      completion_reversed_at: metadata.completionReversedAt ?? '',
      archived_at: task.archivedAt ?? '',
      archive_reason: task.archiveReason ?? '',
      status: task.status,
      lifecycle: task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active'),
      completion_state:
        task.completionState ?? (task.status === 'completed' ? 'completed' : 'open'),
      priority: task.urgency,
      owner_user_id: task.ownerId,
      assignee_user_id: task.assigneeId ?? '',
      category_id: task.categoryId ?? '',
      category_label: metadata.categoryLabel ?? '',
      project_id: task.projectId ?? '',
      project_label: metadata.projectLabel ?? '',
      group_id: task.groupId ?? '',
      group_label: metadata.groupLabel ?? '',
      visibility: task.visibility,
      shared_with_json: stableJson(metadata.sharedWith ?? []),
      lock_state: task.visibility === 'private' ? 'locked' : 'unlocked',
      locked_by_user_id: metadata.lockedByUserId ?? '',
      recurrence_json: stableJson(metadata.recurrence ?? null),
      reminders_json: stableJson(metadata.reminders ?? []),
      list_id: metadata.listId ?? '',
      list_item_id: metadata.listItemId ?? '',
      list_amount_minor: metadata.listAmountMinor ?? '',
      post_it_color: task.postItColor ?? '',
      post_it_effective_color: metadata.effectivePostItColor ?? task.postItColor ?? 'yellow',
      google_task_id: metadata.googleTaskId ?? '',
      google_task_list_id: metadata.googleTaskListId ?? '',
      google_sync_state: metadata.googleSyncState ?? '',
      google_last_synced_at: metadata.googleLastSyncedAt ?? '',
      attachments_json: stableJson(safeAttachments(attachments.get(task.id) ?? [])),
      task_version: task.version,
      completion_version: metadata.completionVersion ?? '',
      sync_state: metadata.syncState ?? 'synced',
      viewer_overall_rank: ranks?.overallRank ?? '',
      viewer_project_rank: ranks?.projectRank ?? '',
    };
    rows.push(CSV_HEADERS.map((header) => csvCell(values[header])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Compatibility name retained for the existing operator export workflow. */
export function transformTodosToCsv(
  tasks: readonly Task[],
  attachments: ReadonlyMap<string, readonly Attachment[]>,
  viewerRanks: ReadonlyMap<string, { overallRank?: number; projectRank?: number }> = new Map(),
) {
  const asOf = tasks.reduce(
    (latest, task) => (task.updatedAt > latest ? task.updatedAt : latest),
    '1970-01-01T00:00:00.000Z',
  );
  return transformCompletedTasksToCsv(tasks, attachments, { asOf, viewerRanks });
}
