import {
  copyJobSchema,
  attachmentSchema,
  blobReferenceSchema,
  deterministicCopyId,
  listItemSchema,
  listSchema,
  transitionCopyJob,
  type CopyJob,
} from '@naaseh/domain';
import { authorizeList } from './list-authorization.js';
import {
  findList,
  findListItem,
  listItemsForList,
  saveList,
  saveListItem,
} from './list-repository.js';
import {
  findCopyCheckpoint,
  findCopyJob,
  saveCopyCheckpoint,
  saveCopyJob,
} from './list-copy-repository.js';
import {
  findAttachment,
  findAttachmentBlob,
  listParentAttachments,
  saveAttachment,
  saveBlobReference,
} from '../attachments/attachment-repository.js';
import { publishAttachmentChange } from '../attachments/attachment-audience.js';
export async function copyList(
  sourceId: string,
  jobId: string,
  actor: { id: string; role: 'admin' | 'user'; active: boolean; groupIds: string[] },
  now = new Date(),
) {
  const replay = await findCopyJob(jobId);
  if (replay?.status === 'ready') return replay;
  if (replay && replay.requestedBy !== actor.id)
    throw Object.assign(new Error('Copy job not found.'), { statusCode: 404 });
  const source = await findList(sourceId);
  if (!source || !authorizeList(source, actor).allowed)
    throw Object.assign(new Error('List not found.'), { statusCode: 404 });
  const sourceItems = (await listItemsForList(source.id)).filter(
    (item) => item.status !== 'removed',
  );
  const timestamp = now.toISOString();
  let job: CopyJob =
    replay ??
    copyJobSchema.parse({
      id: jobId,
      sourceListId: source.id,
      sourceVersion: source.version,
      destinationListId: deterministicCopyId(jobId, source.id),
      requestedBy: actor.id,
      status: 'pending',
      itemCount: sourceItems.length,
      copiedCount: 0,
      attachmentCount: 0,
      linkedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  if (!replay) await saveCopyJob(job);
  if (job.sourceListId !== source.id || job.sourceVersion !== source.version) {
    if (job.status !== 'failed')
      await saveCopyJob(transitionCopyJob(job, 'failed', { errorCode: 'source_changed' }, now));
    throw Object.assign(new Error('The source list changed before copying completed.'), {
      statusCode: 409,
    });
  }
  job = transitionCopyJob(job, 'copying', { errorCode: undefined }, now);
  await saveCopyJob(job);
  const destination = listSchema.parse({
    ...source,
    id: job.destinationListId,
    ownerId: actor.id,
    name: `Copy of ${source.name}`,
    groupId: undefined,
    locked: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
  const copied = sourceItems.map((item) =>
    listItemSchema.parse({
      ...item,
      id: deterministicCopyId(job.id, item.id),
      listId: job.destinationListId,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    }),
  );
  const copiedAttachments = [];
  let copiedCount = 0;
  let attachmentCount = 0;
  for (let index = 0; index < sourceItems.length; index++) {
    const sourceItem = sourceItems[index]!,
      destinationItem = copied[index]!;
    const checkpoint = await findCopyCheckpoint(job.id, sourceItem.id);
    if (checkpoint) {
      copiedCount += 1;
      attachmentCount += checkpoint.copiedAttachments.length;
      copiedAttachments.push(
        ...(await Promise.all(checkpoint.copiedAttachments.map((id) => findAttachment(id)))).filter(
          (item): item is NonNullable<typeof item> => Boolean(item),
        ),
      );
      continue;
    }
    if (!(await findListItem(destinationItem.id)))
      await saveListItem(
        destinationItem,
        actor.id,
        deterministicCopyId(job.id, `item-mutation:${sourceItem.id}`),
        'create',
        ['listId'],
        0,
      );
    copiedCount += 1;
    for (const attachment of await listParentAttachments('listItem', sourceItem.id)) {
      if (attachment.status !== 'available') continue;
      const blob = await findAttachmentBlob(attachment.blobId);
      if (!blob || blob.lifecycle !== 'clean') continue;
      const copy = attachmentSchema.parse({
        ...attachment,
        id: deterministicCopyId(job.id, attachment.id),
        parentId: destinationItem.id,
        uploaderId: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      });
      if (!(await findAttachment(copy.id))) {
        await saveAttachment(copy, 0);
        await saveBlobReference(
          blobReferenceSchema.parse({
            blobId: copy.blobId,
            attachmentId: copy.id,
            createdAt: timestamp,
          }),
        );
      }
      copiedAttachments.push(copy);
      attachmentCount += 1;
    }
    await saveCopyCheckpoint({
      jobId: job.id,
      sourceItemId: sourceItem.id,
      destinationItemId: destinationItem.id,
      copiedAttachments: copiedAttachments
        .filter((item) => item.parentId === destinationItem.id)
        .map((item) => item.id),
      completedAt: new Date().toISOString(),
    });
    job = transitionCopyJob(
      job,
      'copying',
      { copiedCount, attachmentCount, linkedCount: attachmentCount, checkpoint: sourceItem.id },
      now,
    );
    await saveCopyJob(job);
  }
  if (!(await findList(destination.id)))
    await saveList(
      { ...destination, locked: false },
      actor.id,
      deterministicCopyId(job.id, 'list-mutation'),
      'create',
      ['name', 'locked'],
      0,
    );
  for (const attachment of copiedAttachments) await publishAttachmentChange(attachment);
  job = transitionCopyJob(
    job,
    'ready',
    {
      copiedCount: copied.length,
      attachmentCount: copiedAttachments.length,
      linkedCount: copiedAttachments.length,
    },
    now,
  );
  await saveCopyJob(job);
  return job;
}
export async function attachmentIdsForCopy(items: readonly { id: string }[]) {
  const attachments = [];
  for (const item of items) {
    const found = await findListItem(item.id);
    if (found) attachments.push(found.id);
  }
  return attachments;
}
