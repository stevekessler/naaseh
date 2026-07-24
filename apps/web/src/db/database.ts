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
  assigneeId?: string;
  categoryId?: string;
  groupId?: string;
  dueTimeZone?: string;
  parentId?: string;
  visibility: Task['visibility'];
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
  updatedAt?: string;
  mutationId?: string;
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
  }
}

export const db = new NaasehDatabase();
