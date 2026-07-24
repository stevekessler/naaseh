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
export const handler: EventBridgeHandler<
  'GuardDuty Malware Protection Object Scan Result',
  {
    attachmentId?: string;
    scanResultStatus?: string;
    s3ObjectDetails?: { objectKey?: string; objectVersionId?: string };
  },
  void
> = async (event) => {
  const blobId = event.detail.s3ObjectDetails?.objectKey?.match(/^attachments\/(.+)$/)?.[1];
  const blob = blobId ? await findAttachmentBlob(blobId) : undefined;
  const id = event.detail.attachmentId ?? blob?.attachmentId;
  if (!id || !blob || blob.objectVersionId !== event.detail.s3ObjectDetails?.objectVersionId)
    return;
  const current = await findAttachment(id);
  if (!current || current.status !== 'scanning') return;
  const result = event.detail.scanResultStatus;
  const status =
    result === 'NO_THREATS_FOUND'
      ? 'available'
      : result === 'THREATS_FOUND'
        ? 'rejected'
        : 'scan_failed';
  const next = transitionAttachment(current, status);
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
