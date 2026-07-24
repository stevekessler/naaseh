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
import type { Attachment, Task } from '@naaseh/domain';
import { findExportJob, updateExport } from './export-service.js';
import { transformTodosToCsv } from './csv-transformer.js';
import { deleteExportPrefix } from './result-service.js';
import { log, metric } from '@naaseh/observability';
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
    const tasks: Task[] = [];
    const attachments = new Map<string, Attachment[]>();
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
          if (item.SK !== 'CURRENT') continue;
          if (item.PK?.startsWith('TASK#')) {
            if (tasks.length >= MAX_EXPORT_ROWS)
              throw new Error('Export exceeds the 50,000-row bound.');
            tasks.push(item.data as Task);
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
    const csv = transformTodosToCsv(tasks, attachments),
      body = Buffer.from(csv, 'utf8'),
      sha256 = createHash('sha256').update(body).digest('hex'),
      resultKey = `exports/${job.id}.csv`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: resultKey,
        Body: body,
        ContentType: 'text/csv; charset=utf-8',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.NAASEH_EXPORT_KMS_KEY_ARN,
      }),
    );
    job = await updateExport(job, 'ready', {
      resultKey,
      manifest: { rowCount: tasks.length, byteLength: body.byteLength, sha256 },
      downloadExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await deleteExportPrefix(event.exportPrefix);
    log('export.lifecycle', { operation: 'transform', outcome: 'success', jobId: job.id });
    metric('ExportRows', tasks.length);
    metric('ExportBytes', body.byteLength, 'Bytes');
    metric('ExportDuration', Date.now() - startedAt, 'Milliseconds');
    metric('ExportCleanups', 1);
    return { jobId: job.id, rowCount: tasks.length };
  } catch (error) {
    if (job.status === 'pending')
      job = await updateExport(job, 'failed', { failureCode: 'snapshot' });
    else if (job.status === 'exporting' || job.status === 'transforming')
      job = await updateExport(job, 'failed', { failureCode: 'transform' });
    log('export.lifecycle', { operation: 'transform', outcome: 'failure', jobId: job.id });
    metric('ExportFailures', 1);
    throw error;
  }
};
