import { createHash } from 'node:crypto';
import { deletionPreviewSchema, type DeletionPreview } from '@naaseh/domain';
import { listParentAttachments } from '../attachments/attachment-repository.js';
import { findList, listItemsForList } from '../lists/list-repository.js';
import { findTask, listRevisions } from '../tasks/task-repository.js';
import { issueConfirmationToken } from './confirmation-token.js';
import { scanReferences } from './deletion-repository.js';
import { inspectOrganizationDeletion } from '../projects/organization-deletion-service.js';

export const dependencyDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createDeletionPreview(input: {
  resourceType: 'task' | 'list' | 'category' | 'project';
  resourceId: string;
  actorId: string;
  secret: string;
  now?: Date;
}): Promise<DeletionPreview> {
  if (input.resourceType === 'category' || input.resourceType === 'project') {
    const state = await inspectOrganizationDeletion(input.resourceType, input.resourceId);
    const digest = dependencyDigest({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      version: state.resource.version,
      dependentCounts: state.dependentCounts,
    });
    const expiresAt = new Date((input.now ?? new Date()).getTime() + 5 * 60_000).toISOString();
    return deletionPreviewSchema.parse({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      displayLabel: state.resource.name,
      targetVersion: state.resource.version,
      dependentCounts: state.dependentCounts,
      blockers: state.blockers,
      reportingImpact: state.blockers.length
        ? 'Archive and historical reporting references must remain available.'
        : 'This empty organization node and its name reservation will be permanently removed.',
      irreversible: true,
      expiresAt,
      confirmationToken: issueConfirmationToken(
        {
          actorId: input.actorId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          targetVersion: state.resource.version,
          dependencyDigest: digest,
          expiresAt,
        },
        input.secret,
      ),
    });
  }
  const task = input.resourceType === 'task' ? await findTask(input.resourceId) : undefined;
  const list = input.resourceType === 'list' ? await findList(input.resourceId) : undefined;
  const resource = task ?? list;
  if (!resource || resource.ownerId !== input.actorId) throw new Error('Resource not found.');
  const [revisions, children, taskAttachments, reporting] = await Promise.all([
    input.resourceType === 'task' ? listRevisions(input.resourceId) : Promise.resolve([]),
    input.resourceType === 'list' ? listItemsForList(input.resourceId) : Promise.resolve([]),
    input.resourceType === 'task'
      ? listParentAttachments('task', input.resourceId)
      : Promise.resolve([]),
    scanReferences(input.resourceId, [
      'taskId',
      'projectIdAtCompletion',
      'currentCompletionEventId',
    ]),
  ]);
  const childAttachmentGroups = await Promise.all(
    children.map((item) => listParentAttachments('listItem', item.id)),
  );
  const attachments = [...taskAttachments, ...childAttachmentGroups.flat()];
  const dependentCounts = {
    revisions: revisions.length,
    listItems: children.length,
    attachments: attachments.length,
    reportingRecords: reporting.length,
  };
  const digest = dependencyDigest({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    version: resource.version,
    dependentCounts,
  });
  const expiresAt = new Date((input.now ?? new Date()).getTime() + 5 * 60_000).toISOString();
  const claims = {
    actorId: input.actorId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    targetVersion: resource.version,
    dependencyDigest: digest,
    expiresAt,
  };
  return deletionPreviewSchema.parse({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    displayLabel: task?.label ?? list?.name ?? 'Deleted resource',
    targetVersion: resource.version,
    dependentCounts,
    blockers: [],
    reportingImpact: 'Completion statistics and workload history for this work will be reversed.',
    irreversible: true,
    expiresAt,
    confirmationToken: issueConfirmationToken(claims, input.secret),
  });
}
