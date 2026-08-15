import type { Handler } from 'aws-lambda';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  taskSchema,
  type Attachment,
  type CategoryRecord,
  type CompletionEvent,
  type GoogleTaskLink,
  type GroupRecord,
  type Project,
  type Reminder,
  type Task,
} from '@naaseh/domain';
import { findExportJob, updateExport } from './export-service.js';
import {
  transformCompletedTasksToCsv,
  transformTodosToCsv,
  validateCompletedTaskCsv,
} from './csv-transformer.js';
import { deleteExportPrefix } from './result-service.js';
import { log, metric } from '@naaseh/observability';
import {
  authorizeCompletionExportTask,
  completionExportFilterMatches,
  completionExportMetadata,
} from './completion-export-service.js';
import { recordCompletionExport } from '../reporting/telemetry.js';
const s3 = new S3Client({});
const bucket = process.env.NAASEH_EXPORT_BUCKET ?? '';
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_EXPORT_ATTACHMENTS = 500_000;
export const handler: Handler<{
  jobId: string;
  exportPrefix?: string;
  action?: 'transform' | 'expire';
}> = async (event) => {
  const startedAt = Date.now();
  let job = await findExportJob(event.jobId);
  if (!job) throw new Error('Export job not found.');
  if (event.action === 'expire') {
    if (job.status !== 'ready') return { jobId: job.id, status: job.status };
    if (job.resultKey) await deleteExportPrefix(job.resultKey);
    if (job.stagingPrefix) await deleteExportPrefix(job.stagingPrefix);
    job = await updateExport(job, 'expired', { failureCode: 'expired' });
    metric('ExportCleanups', 1);
    return { jobId: job.id, status: job.status };
  }
  if (!event.exportPrefix) throw new Error('Export staging prefix is missing.');
  try {
    job = await updateExport(job, 'exporting', { stagingPrefix: event.exportPrefix });
    job = await updateExport(job, 'transforming');
    const activeJob = job;
    const tasks: Task[] = [];
    const completionEvents = new Map<string, CompletionEvent>();
    const attachments = new Map<string, Attachment[]>();
    const categories = new Map<string, CategoryRecord>();
    const projects = new Map<string, Project>();
    const groups = new Map<string, GroupRecord>();
    const googleLinks = new Map<string, GoogleTaskLink>();
    const reminders = new Map<string, Reminder[]>();
    let attachmentTotal = 0;
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${event.exportPrefix}/data/`,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
        const bytes = await response.Body?.transformToByteArray();
        if (!bytes) continue;
        const text = gunzipSync(bytes).toString('utf8');
        for (const line of text.split('\n')) {
          if (!line) continue;
          const raw = JSON.parse(line) as { Item: Record<string, any> };
          const item = unmarshall(raw.Item) as { PK?: string; SK?: string; data?: unknown };
          if (item.PK?.startsWith('COMPLETION#') && item.SK === 'EVENT') {
            const completion = item.data as CompletionEvent;
            completionEvents.set(completion.id, completion);
            continue;
          }
          if (item.PK?.startsWith('CATEGORY#') && item.SK === 'CATEGORY') {
            const category = item.data as CategoryRecord;
            categories.set(category.id, category);
            continue;
          }
          if (item.PK?.startsWith('GROUP#') && item.SK === 'GROUP') {
            const group = item.data as GroupRecord;
            groups.set(group.id, group);
            continue;
          }
          if (item.PK?.startsWith('TASK#') && item.SK === 'GOOGLE#LINK') {
            const link = item.data as GoogleTaskLink;
            googleLinks.set(link.naasehTaskId, link);
            continue;
          }
          if (item.PK?.startsWith('REMINDER#')) {
            const reminder = item.data as Reminder;
            const group = reminders.get(reminder.taskId) ?? [];
            group.push(reminder);
            reminders.set(reminder.taskId, group);
            continue;
          }
          if (item.SK !== 'CURRENT') continue;
          if (item.PK?.startsWith('TASK#')) {
            if (tasks.length >= MAX_EXPORT_ROWS)
              throw new Error('Export exceeds the 50,000-row bound.');
            tasks.push(taskSchema.parse(item.data));
          }
          if (item.PK?.startsWith('PROJECT#')) {
            const project = item.data as Project;
            projects.set(project.id, project);
          }
          if (item.PK?.startsWith('ATTACHMENT#')) {
            if (attachmentTotal >= MAX_EXPORT_ATTACHMENTS)
              throw new Error('Export attachment metadata exceeds its bound.');
            const attachment = item.data as Attachment;
            const group = attachments.get(attachment.parentId) ?? [];
            group.push(attachment);
            attachments.set(attachment.parentId, group);
            attachmentTotal += 1;
          }
        }
      }
      token = page.NextContinuationToken;
    } while (token);
    const completionTasks =
      activeJob.exportKind === 'completed_tasks'
        ? tasks.filter((task) => {
            const event = task.currentCompletionEventId
              ? completionEvents.get(task.currentCompletionEventId)
              : undefined;
            return (
              authorizeCompletionExportTask(task, event, activeJob) &&
              completionExportFilterMatches(event!, activeJob)
            );
          })
        : tasks;
    const completionMetadata = new Map(
      completionTasks.flatMap((task) => {
        const event = task.currentCompletionEventId
          ? completionEvents.get(task.currentCompletionEventId)
          : undefined;
        return event
          ? [
              [
                task.id,
                {
                  ...completionExportMetadata(task, event),
                  ...(task.categoryId && categories.get(task.categoryId)
                    ? { categoryLabel: categories.get(task.categoryId)!.name }
                    : {}),
                  ...(task.projectId && projects.get(task.projectId)
                    ? { projectLabel: projects.get(task.projectId)!.name }
                    : {}),
                  ...(task.groupId && groups.get(task.groupId)
                    ? { groupLabel: groups.get(task.groupId)!.name }
                    : {}),
                  effectivePostItColor:
                    task.postItColor ??
                    (task.categoryId ? categories.get(task.categoryId)?.color : undefined) ??
                    'yellow',
                  reminders: [...(reminders.get(task.id) ?? [])]
                    .sort(
                      (left, right) =>
                        left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id),
                    )
                    .map(({ id, dueAt, deliveredAt, status, version }) => ({
                      id,
                      dueAt,
                      ...(deliveredAt ? { deliveredAt } : {}),
                      status,
                      version,
                    })),
                  ...(googleLinks.get(task.id)
                    ? {
                        googleTaskId: googleLinks.get(task.id)!.googleTaskId,
                        googleTaskListId: googleLinks.get(task.id)!.googleTaskListId,
                        googleSyncState: googleLinks.get(task.id)!.state,
                        ...(googleLinks.get(task.id)!.lastSyncedAt
                          ? { googleLastSyncedAt: googleLinks.get(task.id)!.lastSyncedAt! }
                          : {}),
                      }
                    : {}),
                },
              ] as const,
            ]
          : [];
      }),
    );
    const csv =
        activeJob.exportKind === 'completed_tasks'
          ? transformCompletedTasksToCsv(completionTasks, attachments, {
              asOf: activeJob.snapshotTime,
              metadata: completionMetadata,
            })
          : transformTodosToCsv(tasks, attachments),
      body = Buffer.from(csv, 'utf8'),
      sha256 = createHash('sha256').update(body).digest('hex'),
      checksumSha256 = createHash('sha256').update(body).digest('base64'),
      resultKey = `exports/${job.id}.csv`;
    if (activeJob.exportKind === 'completed_tasks')
      validateCompletedTaskCsv(csv, completionTasks.length);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: resultKey,
        Body: body,
        ContentType: 'text/csv; charset=utf-8',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.NAASEH_EXPORT_KMS_KEY_ARN,
        ChecksumSHA256: checksumSha256,
        Metadata: {
          sha256,
          rowcount: String(completionTasks.length),
          schema: activeJob.schemaVersion ?? '',
        },
      }),
    );
    job = await updateExport(job, 'ready', {
      resultKey,
      manifest: { rowCount: completionTasks.length, byteLength: body.byteLength, sha256 },
      downloadExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await deleteExportPrefix(event.exportPrefix);
    log('export.lifecycle', { operation: 'transform', outcome: 'success', jobId: job.id });
    metric('ExportRows', completionTasks.length);
    metric('ExportBytes', body.byteLength, 'Bytes');
    metric('ExportDuration', Date.now() - startedAt, 'Milliseconds');
    metric('ExportCleanups', 1);
    if (activeJob.exportKind === 'completed_tasks')
      recordCompletionExport({
        phase: 'transform',
        outcome: 'success',
        scope: activeJob.scope ?? 'self',
        durationMs: Date.now() - startedAt,
        rowCount: completionTasks.length,
      });
    return { jobId: job.id, rowCount: completionTasks.length };
  } catch (error) {
    if (job.status === 'pending')
      job = await updateExport(job, 'failed', { failureCode: 'snapshot' });
    else if (job.status === 'exporting' || job.status === 'transforming')
      job = await updateExport(job, 'failed', { failureCode: 'transform' });
    log('export.lifecycle', { operation: 'transform', outcome: 'failure', jobId: job.id });
    metric('ExportFailures', 1);
    if (job.exportKind === 'completed_tasks')
      recordCompletionExport({
        phase:
          job.status === 'failed' && job.failureCode === 'verification' ? 'verify' : 'transform',
        outcome: 'failure',
        scope: job.scope ?? 'self',
        durationMs: Date.now() - startedAt,
      });
    throw error;
  }
};
