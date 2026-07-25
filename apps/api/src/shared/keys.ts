export const keys = {
  user: (id: string) => ({ PK: `USER#${id}`, SK: 'PROFILE' }),
  username: (name: string) => ({ PK: `USERNAME#${name}`, SK: 'USER' }),
  provisionRequest: (token: string) => ({ PK: `PROVISION#${token}`, SK: 'RESULT' }),
  session: (hash: string) => ({ PK: `SESSION#${hash}`, SK: 'SESSION' }),
  task: (id: string) => ({ PK: `TASK#${id}`, SK: 'CURRENT' }),
  revision: (taskId: string, version: number, id: string) => ({
    PK: `TASK#${taskId}`,
    SK: `REV#${String(version).padStart(12, '0')}#${id}`,
  }),
  // Owner scoping prevents a mutation-ID collision from crossing authorization boundaries.
  mutation: (userId: string, id: string) => ({
    PK: `USER#${userId}`,
    SK: `MUTATION#${id}`,
  }),
  entity: (entityType: string, id: string) => ({
    PK: `${entityType.toUpperCase()}#${id}`,
    SK: 'CURRENT',
  }),
  entityRevision: (entityType: string, id: string, version: number, revisionId: string) => ({
    PK: `${entityType.toUpperCase()}#${id}`,
    SK: `REV#${String(version).padStart(12, '0')}#${revisionId}`,
  }),
  list: (id: string) => ({ PK: `LIST#${id}`, SK: 'CURRENT' }),
  listItem: (id: string) => ({ PK: `LISTITEM#${id}`, SK: 'CURRENT' }),
  listOrderedItem: (listId: string, orderKey: string, id: string) => ({
    PK: `LIST#${listId}`,
    SK: `ITEM#${orderKey}#${id}`,
  }),
  directoryItem: (id: string) => ({ PK: `DIRECTORY#${id}`, SK: 'CURRENT' }),
  attachment: (id: string) => ({ PK: `ATTACHMENT#${id}`, SK: 'CURRENT' }),
  attachmentBlob: (id: string) => ({ PK: `BLOB#${id}`, SK: 'CURRENT' }),
  blobReference: (blobId: string, attachmentId: string) => ({
    PK: `BLOB#${blobId}`,
    SK: `REF#${attachmentId}`,
  }),
  uploadSession: (id: string) => ({ PK: `UPLOAD#${id}`, SK: 'SESSION' }),
  uploadRequest: (actorId: string, mutationId: string) => ({
    PK: `USER#${actorId}`,
    SK: `UPLOADREQUEST#${mutationId}`,
  }),
  copyJob: (id: string) => ({ PK: `COPYJOB#${id}`, SK: 'CURRENT' }),
  exportJob: (id: string) => ({ PK: `EXPORTJOB#${id}`, SK: 'CURRENT' }),
  category: (id: string) => ({ PK: `CATEGORY#${id}`, SK: 'CATEGORY' }),
  project: (id: string) => ({ PK: `PROJECT#${id}`, SK: 'CURRENT' }),
  projectName: (categoryId: string, canonicalName: string) => ({
    PK: `PROJECTNAME#${categoryId}#${canonicalName}`,
    SK: 'PROJECT',
  }),
  completionEvent: (taskId: string, occurredAt: string, id: string) => ({
    PK: `TASK#${taskId}`,
    SK: `COMPLETION#${occurredAt}#${id}`,
  }),
  completionEventById: (id: string) => ({ PK: `COMPLETION#${id}`, SK: 'EVENT' }),
  workloadCounter: (audience: string, scopeType: string, scopeId: string, workType: string) => ({
    PK: `WORKLOAD#${audience}`,
    SK: `COUNT#${scopeType}#${scopeId}#${workType}`,
  }),
  workloadPointer: (
    audience: string,
    scopeType: string,
    scopeId: string,
    workType: string,
    workId: string,
  ) => ({
    PK: `WORKLOAD#${audience}`,
    SK: `ITEM#${scopeType}#${scopeId}#${workType}#${workId}`,
  }),
  completionProjection: (
    userId: string,
    utcDate: string,
    categoryId: string,
    projectId: string,
  ) => ({
    PK: `COMPLETIONS#USER#${userId}`,
    SK: `DAY#${utcDate}#CATEGORY#${categoryId}#PROJECT#${projectId}`,
  }),
  deletionJob: (id: string) => ({ PK: `DELETEJOB#${id}`, SK: 'CURRENT' }),
  deletionReceipt: (actorId: string, mutationId: string) => ({
    PK: `USER#${actorId}`,
    SK: `DELETION#${mutationId}`,
  }),
  deletionLedger: (resourceType: string, resourceId: string) => ({
    PK: 'DELETIONLEDGER',
    SK: `${resourceType.toUpperCase()}#${resourceId}`,
  }),
  migrationCheckpoint: (name: string, id: string) => ({
    PK: `MIGRATION#${name}`,
    SK: `CHECKPOINT#${id}`,
  }),
  jobCheckpoint: (jobType: 'COPY' | 'EXPORT', id: string, checkpoint: string) => ({
    PK: `${jobType}JOB#${id}`,
    SK: `CHECKPOINT#${checkpoint}`,
  }),
};
