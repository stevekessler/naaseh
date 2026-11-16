import type { Attachment, Task } from '@naaseh/domain';

export const attachmentRetentionMs = 30 * 24 * 60 * 60 * 1000;

export function attachmentPurgeAfter(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return new Date(timestamp + attachmentRetentionMs).toISOString();
}

export function taskAttachmentRetention(
  task: Pick<Task, 'status' | 'lifecycle' | 'archivedAt' | 'completedAt' | 'updatedAt'> | undefined,
): Pick<Attachment, 'purgeAfter' | 'retentionReason'> | undefined {
  if (!task) return undefined;
  const completed = task.status === 'completed' || task.completedAt !== undefined;
  const archived = task.lifecycle === 'archived' || task.status === 'archived';
  if (!completed && !archived) return undefined;
  const retainedAt = task.completedAt ?? task.archivedAt ?? task.updatedAt;
  return {
    purgeAfter: attachmentPurgeAfter(retainedAt),
    retentionReason: completed ? 'completed' : 'archived',
  };
}

/** Financial receipts follow their own transaction's deletion, independent of tasks. */
export function receiptRetention(
  current: Pick<Attachment, 'purgeAfter' | 'retentionReason'>,
  transaction: { status?: unknown } | undefined,
  now: Date,
): Pick<Attachment, 'purgeAfter' | 'retentionReason'> | undefined {
  if (transaction && transaction.status !== 'tombstone' && transaction.status !== 'deleted')
    return undefined;
  return {
    purgeAfter: current.purgeAfter ?? attachmentPurgeAfter(now),
    retentionReason: 'deleted',
  };
}
