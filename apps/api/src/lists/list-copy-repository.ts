import type { CopyJob } from '@naaseh/domain';
import { getRecord, putRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';

export interface CopyCheckpoint {
  jobId: string;
  sourceItemId: string;
  destinationItemId: string;
  copiedAttachments: string[];
  completedAt: string;
}

export async function findCopyJob(id: string) {
  return (await getRecord<{ data: CopyJob }>(keys.copyJob(id).PK, 'CURRENT'))?.data;
}

export async function saveCopyJob(job: CopyJob) {
  await putRecord(
    { ...keys.copyJob(job.id), data: job, version: job.updatedAt },
    'attribute_not_exists(PK) OR #version <= :updated',
    { '#version': 'version' },
    { ':updated': job.updatedAt },
  );
  return job;
}

export async function findCopyCheckpoint(jobId: string, sourceItemId: string) {
  const key = keys.jobCheckpoint('COPY', jobId, sourceItemId);
  return (await getRecord<{ data: CopyCheckpoint }>(key.PK, key.SK))?.data;
}

export async function saveCopyCheckpoint(checkpoint: CopyCheckpoint) {
  const key = keys.jobCheckpoint('COPY', checkpoint.jobId, checkpoint.sourceItemId);
  await putRecord({ ...key, data: checkpoint }, 'attribute_not_exists(PK)');
  return checkpoint;
}
