import type { DeletionJob } from '@naaseh/domain';
import { deletionLedgerEntrySchema, listSchema, taskSchema } from '@naaseh/domain';
import { purgeAttachmentsForParent } from '../attachments/deletion-service.js';
import { findList, listItemsForList } from '../lists/list-repository.js';
import { keys } from '../shared/keys.js';
import { putRecord } from '../shared/store.js';
import { appendAudienceChange, contentAudiences } from '../sync/change-feed-repository.js';
import { findTask } from '../tasks/task-repository.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';
import {
  deletePartition,
  removeReferenceKeys,
  saveDeletionJob,
  scanReferences,
  writeDeletionLedger,
} from './deletion-repository.js';

const stages = [
  'locked',
  'children',
  'revisions',
  'events',
  'attachments',
  'projections',
  'feeds',
  'complete',
] as const;

export type DeletionCheckpoint = Record<string, string | number | boolean>;

export function nextDeletionCheckpoint(checkpoint: DeletionCheckpoint): DeletionCheckpoint {
  const current =
    typeof checkpoint.stage === 'string' ? stages.indexOf(checkpoint.stage as any) : -1;
  if (current >= stages.length - 1) return checkpoint;
  return { ...checkpoint, stage: stages[current + 1]!, completedStages: current + 2 };
}

export const canRequestPermanentDeletion = (actorId: string, ownerId: string, online: boolean) =>
  online && actorId === ownerId;

export function jobStateForCheckpoint(
  job: DeletionJob,
  checkpoint: DeletionCheckpoint,
): DeletionJob {
  const stage = String(checkpoint.stage ?? '');
  const index = Math.max(0, stages.indexOf(stage as any));
  const complete = stage === 'complete';
  const now = new Date().toISOString();
  return {
    ...job,
    status: complete ? 'complete' : index === 0 ? 'locking' : 'purging',
    progress: complete ? 100 : Math.round((index / (stages.length - 1)) * 95),
    checkpoint,
    updatedAt: now,
    ...(complete ? { completedAt: now } : {}),
  };
}

async function loadResource(job: DeletionJob) {
  return job.resourceType === 'task' ? findTask(job.resourceId) : findList(job.resourceId);
}

async function lockResource(job: DeletionJob) {
  const resource = await loadResource(job);
  if (!resource) return;
  const next =
    job.resourceType === 'task'
      ? taskSchema.parse({
          ...resource,
          lifecycle: 'deleting',
          updatedAt: new Date().toISOString(),
          version: resource.version + 1,
        })
      : listSchema.parse({
          ...resource,
          lifecycle: 'deleting',
          updatedAt: new Date().toISOString(),
          version: resource.version + 1,
        });
  await putRecord(
    {
      ...keys.entity(job.resourceType, job.resourceId),
      data: next,
      version: next.version,
      GSI1PK: `${job.resourceType.toUpperCase()}#OWNER#${next.ownerId}`,
      GSI1SK: next.updatedAt,
    },
    '#version=:expected',
    { '#version': 'version' },
    { ':expected': resource.version },
  );
  if (job.resourceType === 'task' || job.resourceType === 'list')
    notifyStackMembershipWorkChange(job.resourceType, resource, next, 'delete');
}

async function publishDeletionTombstones(job: DeletionJob) {
  const task = job.resourceType === 'task' ? await findTask(job.resourceId) : undefined;
  const list = job.resourceType === 'list' ? await findList(job.resourceId) : undefined;
  const resource = task ?? list;
  if (!resource) return;
  const audiences = contentAudiences({
    entityId: resource.id,
    ownerId: resource.ownerId,
    locked: task ? task.visibility === 'private' : (list?.locked ?? true),
    ...(resource.groupId ? { groupId: resource.groupId } : {}),
  });
  for (const audience of audiences)
    await appendAudienceChange({
      audience,
      entityType: job.resourceType,
      entityId: job.resourceId,
      version: resource.version,
      operation: 'tombstone',
      changedAt: new Date().toISOString(),
    });
}

export async function executeDeletionStep(job: DeletionJob): Promise<DeletionJob> {
  if (job.status === 'complete') return job;
  const checkpoint = nextDeletionCheckpoint(job.checkpoint);
  switch (checkpoint.stage) {
    case 'locked':
      await lockResource(job);
      break;
    case 'children':
      // Child identifiers remain available until attachment references are released.
      break;
    case 'revisions':
      await deletePartition(keys.entity(job.resourceType, job.resourceId).PK, 'REV#');
      break;
    case 'events':
      if (job.resourceType === 'task')
        await deletePartition(keys.task(job.resourceId).PK, 'COMPLETION#');
      break;
    case 'attachments':
      if (job.resourceType === 'task') await purgeAttachmentsForParent('task', job.resourceId);
      else {
        const items = await listItemsForList(job.resourceId);
        for (const item of items) await purgeAttachmentsForParent('listItem', item.id);
        for (const item of items) await deletePartition(keys.listItem(item.id).PK);
      }
      break;
    case 'projections':
      await removeReferenceKeys(
        await scanReferences(job.resourceId, ['taskId', 'resourceId', 'currentCompletionEventId']),
      );
      break;
    case 'feeds': {
      await publishDeletionTombstones(job);
      await deletePartition(keys.entity(job.resourceType, job.resourceId).PK);
      await writeDeletionLedger(
        deletionLedgerEntrySchema.parse({
          resourceType: job.resourceType,
          resourceId: job.resourceId,
          deletedAt: new Date().toISOString(),
          deletionJobId: job.id,
          scopeDigest: job.dependencyDigest,
          ledgerVersion: 1,
        }),
      );
      break;
    }
  }
  return saveDeletionJob(jobStateForCheckpoint(job, checkpoint));
}
