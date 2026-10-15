import type { EventBridgeHandler } from 'aws-lambda';
import { attachmentBlobSchema, transitionAttachment } from '@naaseh/domain';
import {
  findAttachment,
  findAttachmentBlob,
  saveAttachment,
  saveAttachmentBlob,
} from './attachment-repository.js';
import { publishAttachmentChange } from './attachment-audience.js';
import { log, metric } from '@naaseh/observability';

type GuardDutyScanDetail = {
  attachmentId?: string;
  scanResultDetails?: { scanResultStatus?: string };
  s3ObjectDetails?: { bucketName?: string; objectKey?: string; versionId?: string };
};

export function parseGuardDutyScanResult(detail: GuardDutyScanDetail, bucket: string) {
  if (detail.s3ObjectDetails?.bucketName && detail.s3ObjectDetails.bucketName !== bucket)
    return undefined;
  const blobId = detail.s3ObjectDetails?.objectKey?.match(/^attachments\/(.+)$/)?.[1];
  const versionId = detail.s3ObjectDetails?.versionId;
  const result = detail.scanResultDetails?.scanResultStatus;
  return blobId && versionId && result ? { blobId, versionId, result } : undefined;
}

export const handler: EventBridgeHandler<
  'GuardDuty Malware Protection Object Scan Result',
  GuardDutyScanDetail,
  void
> = async (event) => {
  const parsed = parseGuardDutyScanResult(event.detail, process.env.NAASEH_ATTACHMENT_BUCKET ?? '');
  if (!parsed) return;
  const blob = await findAttachmentBlob(parsed.blobId);
  const id = event.detail.attachmentId ?? blob?.attachmentId;
  if (!id || !blob || blob.objectVersionId !== parsed.versionId) return;
  const current = await findAttachment(id);
  if (!current || current.status !== 'scanning') return;
  const result = parsed.result;
  const status =
    result === 'NO_THREATS_FOUND'
      ? 'available'
      : result === 'THREATS_FOUND'
        ? 'rejected'
        : 'scan_failed';
  const next = {
    ...transitionAttachment(current, status),
    ...(status === 'rejected'
      ? { failureCode: 'malware' as const }
      : status === 'scan_failed'
        ? { failureCode: 'scan_error' as const }
        : {}),
  };
  await saveAttachmentBlob(
    attachmentBlobSchema.parse({
      ...blob,
      scanStatus: status === 'available' ? 'clean' : status === 'rejected' ? 'threat' : 'failed',
      lifecycle: status === 'available' ? 'clean' : 'quarantined',
      updatedAt: new Date().toISOString(),
    }),
  );
  await saveAttachment(next, current.version);
  await publishAttachmentChange(next);
  log('attachment.scan_result', {
    attachmentId: current.id,
    outcome: status,
    status,
  });
  metric('AttachmentScanResults', 1, 'Count', { status });
  if (status !== 'available') metric('AttachmentScanFailures', 1, 'Count', { status });
  if (status === 'rejected') metric('AttachmentThreats', 1);
  metric(
    'AttachmentScanLatency',
    Date.now() - new Date(current.createdAt).getTime(),
    'Milliseconds',
  );
};
