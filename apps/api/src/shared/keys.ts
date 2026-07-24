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
  jobCheckpoint: (jobType: 'COPY' | 'EXPORT', id: string, checkpoint: string) => ({
    PK: `${jobType}JOB#${id}`,
    SK: `CHECKPOINT#${checkpoint}`,
  }),
};
