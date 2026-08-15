import Dexie, { type EntityTable } from 'dexie';
import type { Mutation, Task, TaskRevision } from '@naaseh/domain';
import type { Ciphertext } from '../crypto/vault.js';

export interface LocalSetting {
  key: string;
  value: string;
}
export interface EncryptedTaskRecord {
  id: string;
  ownerId: string;
  status: Task['status'];
  dueAt?: string;
  dueKind?: Task['dueKind'];
  dueDate?: string;
  assigneeId?: string;
  categoryId?: string;
  projectId?: string;
  groupId?: string;
  lifecycle?: string;
  completionState?: string;
  dueTimeZone?: string;
  parentId?: string;
  visibility: Task['visibility'];
  urgency?: string;
  updatedAt: string;
  value: Ciphertext;
}
export interface StoredMutation extends Omit<Mutation, 'payload'> {
  payload: Ciphertext;
}
export interface StoredCryptoKey {
  id: string;
  key: CryptoKey;
}
export interface EncryptedEntityRecord {
  id: string;
  taskId?: string;
  ownerId?: string;
  projectId?: string;
  categoryId?: string;
  lifecycle?: string;
  completionState?: string;
  completedBy?: string;
  occurredAt?: string;
  reversedAt?: string;
  updatedAt?: string;
  mutationId?: string;
  urgency?: string;
  urgencyAtCompletion?: string;
  scopeType?: string;
  scopeId?: string;
  scopeKey?: string;
  workType?: string;
  workId?: string;
  membershipEpoch?: string;
  operationId?: string;
  stackVersion?: number;
  generation?: number;
  chunkIndex?: number;
  value: Ciphertext;
}

class NaasehDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  revisions!: EntityTable<TaskRevision, 'id'>;
  outbox!: EntityTable<StoredMutation, 'id'>;
  settings!: EntityTable<LocalSetting, 'key'>;
  secureTasks!: EntityTable<EncryptedTaskRecord, 'id'>;
  cryptoKeys!: EntityTable<StoredCryptoKey, 'id'>;
  secureCategories!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureRevisions!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureReminders!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureConflicts!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureGroups!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureLists!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureListItems!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureDirectoryItems!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureAttachments!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureJobs!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureProjects!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureCompletionEvents!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureDeletionJobs!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureGoogleSync!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackScopes!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackMemberships!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackOperations!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackOperationChunks!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackSnapshots!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureStackConflicts!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureTaskTimers!: EntityTable<EncryptedEntityRecord, 'id'>;
  secureTimerCheckpoints!: EntityTable<EncryptedEntityRecord, 'id'>;
  constructor() {
    super('naaseh');
    this.version(1).stores({
      tasks: 'id, ownerId, status, dueAt, assigneeId, categoryId, parentId, visibility, updatedAt',
      revisions: 'id, taskId, changedAt',
      outbox: 'id, entityId, createdAt, attempts',
      settings: 'key',
    });
    this.version(2).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
    });
    this.version(3).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,updatedAt',
      secureRevisions: 'id,taskId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
    });
    this.version(4).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,updatedAt',
      secureRevisions: 'id,taskId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
    });
    this.version(5).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,updatedAt',
      secureRevisions: 'id,taskId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
    });
    this.version(6).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,dueAt,dueTimeZone,assigneeId,categoryId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
    });
    this.version(7).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,dueAt,dueTimeZone,assigneeId,categoryId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,entityType,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
      secureLists: 'id,updatedAt',
      secureListItems: 'id,taskId,updatedAt',
      secureDirectoryItems: 'id,updatedAt',
      secureAttachments: 'id,taskId,updatedAt',
      secureJobs: 'id,updatedAt',
    });
    this.version(8).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,lifecycle,completionState,dueAt,dueTimeZone,assigneeId,categoryId,projectId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,entityType,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,lifecycle,updatedAt',
      secureProjects: 'id,categoryId,lifecycle,updatedAt',
      secureCompletionEvents:
        'id,taskId,completedBy,occurredAt,projectId,categoryId,reversedAt,updatedAt',
      secureDeletionJobs: 'id,taskId,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
      secureLists: 'id,projectId,lifecycle,updatedAt',
      secureListItems: 'id,taskId,updatedAt',
      secureDirectoryItems: 'id,updatedAt',
      secureAttachments: 'id,taskId,updatedAt',
      secureJobs: 'id,updatedAt',
    });
    this.version(9).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,lifecycle,completionState,dueAt,dueTimeZone,assigneeId,categoryId,projectId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,entityType,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,lifecycle,updatedAt',
      secureProjects: 'id,categoryId,lifecycle,updatedAt',
      secureCompletionEvents:
        'id,taskId,completedBy,occurredAt,projectId,categoryId,reversedAt,updatedAt',
      secureDeletionJobs: 'id,taskId,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
      secureLists: 'id,projectId,lifecycle,updatedAt',
      secureListItems: 'id,taskId,updatedAt',
      secureDirectoryItems: 'id,updatedAt',
      secureAttachments: 'id,taskId,updatedAt',
      secureJobs: 'id,updatedAt',
      secureGoogleSync: 'id,updatedAt',
    });
    this.version(10).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,lifecycle,completionState,urgency,dueAt,dueTimeZone,assigneeId,categoryId,projectId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,entityType,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,lifecycle,updatedAt',
      secureProjects: 'id,categoryId,lifecycle,updatedAt',
      secureCompletionEvents:
        'id,taskId,completedBy,occurredAt,projectId,categoryId,urgencyAtCompletion,reversedAt,updatedAt',
      secureDeletionJobs: 'id,taskId,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
      secureLists: 'id,projectId,lifecycle,urgency,updatedAt',
      secureListItems: 'id,taskId,updatedAt',
      secureDirectoryItems: 'id,updatedAt',
      secureAttachments: 'id,taskId,updatedAt',
      secureJobs: 'id,updatedAt',
      secureGoogleSync: 'id,updatedAt',
      secureStackScopes: 'id,ownerId,scopeType,scopeId,updatedAt',
      secureStackMemberships: 'id,ownerId,scopeKey,workType,workId,membershipEpoch,updatedAt',
      secureStackOperations: 'id,ownerId,scopeKey,stackVersion,mutationId,updatedAt',
      secureStackOperationChunks: 'id,ownerId,scopeKey,operationId,chunkIndex,updatedAt',
      secureStackSnapshots: 'id,ownerId,scopeKey,generation,chunkIndex,updatedAt',
      secureStackConflicts: 'id,ownerId,scopeKey,operationId,updatedAt',
    });
    this.version(11).stores({
      tasks: 'id,ownerId,status,dueAt,assigneeId,categoryId,parentId,visibility,updatedAt',
      secureTasks:
        'id,ownerId,status,lifecycle,completionState,urgency,dueAt,dueTimeZone,assigneeId,categoryId,projectId,groupId,parentId,visibility,updatedAt',
      revisions: 'id,taskId,changedAt',
      outbox: 'id,entityId,entityType,createdAt,attempts',
      settings: 'key',
      cryptoKeys: 'id',
      secureCategories: 'id,lifecycle,updatedAt',
      secureProjects: 'id,categoryId,lifecycle,updatedAt',
      secureCompletionEvents:
        'id,taskId,completedBy,occurredAt,projectId,categoryId,urgencyAtCompletion,reversedAt,updatedAt',
      secureDeletionJobs: 'id,taskId,updatedAt',
      secureRevisions: 'id,taskId,mutationId,updatedAt',
      secureReminders: 'id,taskId,updatedAt',
      secureConflicts: 'id,updatedAt',
      secureGroups: 'id,updatedAt',
      secureLists: 'id,projectId,lifecycle,urgency,updatedAt',
      secureListItems: 'id,taskId,updatedAt',
      secureDirectoryItems: 'id,updatedAt',
      secureAttachments: 'id,taskId,updatedAt',
      secureJobs: 'id,updatedAt',
      secureGoogleSync: 'id,updatedAt',
      secureStackScopes: 'id,ownerId,scopeType,scopeId,updatedAt',
      secureStackMemberships: 'id,ownerId,scopeKey,workType,workId,membershipEpoch,updatedAt',
      secureStackOperations: 'id,ownerId,scopeKey,stackVersion,mutationId,updatedAt',
      secureStackOperationChunks: 'id,ownerId,scopeKey,operationId,chunkIndex,updatedAt',
      secureStackSnapshots: 'id,ownerId,scopeKey,generation,chunkIndex,updatedAt',
      secureStackConflicts: 'id,ownerId,scopeKey,operationId,updatedAt',
      secureTaskTimers: 'id,ownerId,taskId,updatedAt',
      secureTimerCheckpoints: 'id,ownerId,taskId,updatedAt',
    });
  }
}

export const db = new NaasehDatabase();
