export type PersonalStackKeyScope =
  | { userId: string; scopeType: 'overall' }
  | { userId: string; scopeType: 'project'; scopeId: string };

const paddedStackNumber = (value: number) => String(value).padStart(12, '0');
const personalStackPartition = (scope: PersonalStackKeyScope) =>
  scope.scopeType === 'overall'
    ? `STACK#USER#${scope.userId}#OVERALL`
    : `STACK#USER#${scope.userId}#PROJECT#${scope.scopeId}`;

export const keys = {
  user: (id: string) => ({ PK: `USER#${id}`, SK: 'PROFILE' }),
  username: (name: string) => ({ PK: `USERNAME#${name}`, SK: 'USER' }),
  provisionRequest: (token: string) => ({ PK: `PROVISION#${token}`, SK: 'RESULT' }),
  session: (hash: string) => ({ PK: `SESSION#${hash}`, SK: 'SESSION' }),
  task: (id: string) => ({ PK: `TASK#${id}`, SK: 'CURRENT' }),
  taskTimer: (ownerId: string) => ({ PK: `USER#${ownerId}`, SK: 'TIMER#CURRENT' }),
  taskTimerRevision: (ownerId: string, version: number, runId: string) => ({
    PK: `USER#${ownerId}`,
    SK: `TIMER#REV#${String(version).padStart(12, '0')}#${runId}`,
  }),
  taskTimerReceipt: (ownerId: string, mutationId: string) => ({
    PK: `USER#${ownerId}`,
    SK: `TIMER#RECEIPT#${mutationId}`,
  }),
  taskTimerOwnerFeedCounter: (ownerId: string) => ({
    PK: `FEED#OWNER#${ownerId}`,
    SK: 'COUNTER',
  }),
  taskTimerOwnerFeedEntry: (ownerId: string, sequence: number) => ({
    PK: `FEED#OWNER#${ownerId}`,
    SK: `CHANGE#${String(sequence).padStart(20, '0')}`,
  }),
  revision: (taskId: string, version: number, id: string) => ({
    PK: `TASK#${taskId}`,
    SK: `REV#${String(version).padStart(12, '0')}#${id}`,
  }),
  // Owner scoping prevents a mutation-ID collision from crossing authorization boundaries.
  mutation: (userId: string, id: string) => ({
    PK: `USER#${userId}`,
    SK: `MUTATION#${id}`,
  }),
  personalStackMetadata: (scope: PersonalStackKeyScope) => ({
    PK: personalStackPartition(scope),
    SK: 'META',
  }),
  personalStackOperation: (scope: PersonalStackKeyScope, version: number, operationId: string) => ({
    PK: personalStackPartition(scope),
    SK: `OP#${paddedStackNumber(version)}#${operationId}`,
  }),
  personalStackOperationChunk: (
    scope: PersonalStackKeyScope,
    version: number,
    operationId: string,
    chunkIndex: number,
  ) => ({
    PK: personalStackPartition(scope),
    SK: `OP#${paddedStackNumber(version)}#${operationId}#CHUNK#${paddedStackNumber(chunkIndex)}`,
  }),
  // Stack mutation IDs are idempotent across every scope owned by the user.
  personalStackMutationReceipt: (userId: string, mutationId: string) => ({
    PK: `USER#${userId}`,
    SK: `MUTATION#${mutationId}`,
  }),
  personalStackSnapshotChunk: (
    scope: PersonalStackKeyScope,
    generation: number,
    chunkIndex: number,
  ) => ({
    PK: personalStackPartition(scope),
    SK: `SNAPSHOT#${paddedStackNumber(generation)}#CHUNK#${paddedStackNumber(chunkIndex)}`,
  }),
  personalStackAudit: (scope: PersonalStackKeyScope, acceptedAt: string, operationId: string) => ({
    PK: personalStackPartition(scope),
    SK: `AUDIT#${acceptedAt}#${operationId}`,
  }),
  personalStackOwnerFeedCounter: (userId: string) => ({
    PK: `FEED#OWNER#${userId}`,
    SK: 'COUNTER',
  }),
  personalStackOwnerFeedEntry: (userId: string, sequence: number) => ({
    PK: `FEED#OWNER#${userId}`,
    SK: `CHANGE#${String(sequence).padStart(20, '0')}`,
  }),
  paginationCursor: (userId: string, cursorId: string) => ({
    PK: `USER#${userId}`,
    SK: `CURSOR#${cursorId}`,
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
  completionDetail: (userId: string, occurredAt: string, id: string) => ({
    PK: `COMPLETIONDETAIL#USER#${userId}`,
    SK: `EVENT#${occurredAt}#${id}`,
  }),
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
  tfaFactor: (userId: string) => ({ PK: `USER#${userId}`, SK: 'TFA#FACTOR' }),
  loginTransaction: (tokenDigest: string) => ({
    PK: `LOGIN#${tokenDigest}`,
    SK: 'CHALLENGE',
  }),
  adminTfaRecoveryAudit: (id: string) => ({ PK: 'AUDIT#ADMIN_TFA_RECOVERY', SK: id }),
  jobCheckpoint: (jobType: 'COPY' | 'EXPORT', id: string, checkpoint: string) => ({
    PK: `${jobType}JOB#${id}`,
    SK: `CHECKPOINT#${checkpoint}`,
  }),
  googleConnection: (userId: string) => ({ PK: `USER#${userId}`, SK: 'GOOGLE#CONNECTION' }),
  googleConnectionById: (connectionId: string) => ({
    PK: `GOOGLECONN#${connectionId}`,
    SK: 'CONNECTION',
  }),
  googleOAuthState: (stateHash: string) => ({ PK: `OAUTHSTATE#${stateHash}`, SK: 'GOOGLE' }),
  googleTaskLink: (taskId: string) => ({ PK: `TASK#${taskId}`, SK: 'GOOGLE#LINK' }),
  googleTaskReverseLink: (connectionId: string, googleTaskId: string) => ({
    PK: `GOOGLETASK#${connectionId}#${googleTaskId}`,
    SK: 'LINK',
  }),
  googleOperation: (connectionId: string, state: string, createdAt: string, id: string) => ({
    PK: `GOOGLECONN#${connectionId}`,
    SK: `OP#${state}#${createdAt}#${id}`,
  }),
  googleConflict: (connectionId: string, id: string) => ({
    PK: `GOOGLECONN#${connectionId}`,
    SK: `CONFLICT#${id}`,
  }),
  googleRun: (connectionId: string, startedAt: string, id: string) => ({
    PK: `GOOGLECONN#${connectionId}`,
    SK: `RUN#${startedAt}#${id}`,
  }),
  googleRunById: (id: string) => ({ PK: `GOOGLERUN#${id}`, SK: 'RUN' }),
  googleTaskSharing: (taskId: string) => ({ PK: `TASK#${taskId}`, SK: 'GOOGLE#SHARING' }),
};
