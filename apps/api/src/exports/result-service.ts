import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ExportJob } from '@naaseh/domain';
import { updateExport } from './export-service.js';
import { recordCompletionExport } from '../reporting/telemetry.js';
const s3 = new S3Client({});
const bucket = process.env.NAASEH_EXPORT_BUCKET ?? '';
export async function readyExportResult(job: ExportJob) {
  if (job.status !== 'ready' || !job.resultKey || !job.manifest)
    throw new Error('Export result is not ready.');
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: job.resultKey, ChecksumMode: 'ENABLED' }),
  );
  if (
    head.ContentLength !== job.manifest.byteLength ||
    head.Metadata?.sha256 !== job.manifest.sha256 ||
    Number(head.Metadata?.rowcount) !== job.manifest.rowCount
  ) {
    if (job.exportKind === 'completed_tasks')
      recordCompletionExport({
        phase: 'verify',
        outcome: 'failure',
        scope: job.scope ?? 'self',
      });
    throw new Error('Export integrity verification failed.');
  }
  return {
    downloadUrl: await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: job.resultKey }),
      { expiresIn: 60 },
    ),
    manifest: job.manifest,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
export async function acknowledgeExport(job: ExportJob) {
  if (job.status !== 'ready') return job;
  if (job.resultKey) await deleteExportPrefix(job.resultKey);
  if (job.stagingPrefix) await deleteExportPrefix(job.stagingPrefix);
  return updateExport(job, 'acknowledged');
}
export async function deleteExportPrefix(prefix: string) {
  let keyMarker: string | undefined, versionMarker: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix,
        ...(keyMarker ? { KeyMarker: keyMarker } : {}),
        ...(versionMarker ? { VersionIdMarker: versionMarker } : {}),
      }),
    );
    const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].flatMap((item) =>
      item.Key && item.VersionId ? [{ Key: item.Key, VersionId: item.VersionId }] : [],
    );
    if (objects.length)
      await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
    keyMarker = page.NextKeyMarker;
    versionMarker = page.NextVersionIdMarker;
  } while (keyMarker);
}
