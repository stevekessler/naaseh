import {
  applyFilteredPermutation,
  applySimpleMove,
  createUlid,
  type PersonalStackMove,
  type WorkReference,
} from '@naaseh/domain';
import { db, type EncryptedEntityRecord, type StoredMutation } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

export type LocalStackWorkReference = WorkReference;

export type LocalStackScope = { scopeType: 'overall' } | { scopeType: 'project'; scopeId: string };

export type LocalStackMove = PersonalStackMove;

interface LocalStackState {
  ownerId: string;
  scope: LocalStackScope;
  version: number;
  work: LocalStackWorkReference[];
  updatedAt: string;
}

interface LocalStackOperation {
  id: string;
  operationId: string;
  mutationId: string;
  ownerId: string;
  scope: LocalStackScope;
  scopeKey: string;
  baseVersion: number;
  version: number;
  sourceClientId: string;
  move: LocalStackMove;
  status: 'pending' | 'applied' | 'conflict';
  createdAt: string;
  updatedAt: string;
}

export interface LocalStackConflict {
  id: string;
  ownerId: string;
  scope: LocalStackScope;
  scopeKey: string;
  operationId: string;
  mutationId: string;
  reason:
    | 'version_mismatch'
    | 'anchor_removed'
    | 'authorization_changed'
    | 'lifecycle_changed'
    | 'project_changed'
    | 'filter_basis_changed'
    | 'hard_deleted';
  baseVersion: number;
  currentVersion: number;
  move: LocalStackMove;
  sourceClientId: string;
  createdAt: string;
}

const referenceKey = (work: LocalStackWorkReference) =>
  `${work.workType}:${work.workId}:${work.membershipEpoch}`;

export const localStackScopeKey = (ownerId: string, scope: LocalStackScope) =>
  scope.scopeType === 'overall' ? `${ownerId}:overall` : `${ownerId}:project:${scope.scopeId}`;

const scopeRecord = async (state: LocalStackState): Promise<EncryptedEntityRecord> => {
  const id = localStackScopeKey(state.ownerId, state.scope);
  return {
    id,
    ownerId: state.ownerId,
    scopeType: state.scope.scopeType,
    ...(state.scope.scopeType === 'project' ? { scopeId: state.scope.scopeId } : {}),
    updatedAt: state.updatedAt,
    value: await encryptLocalValue('personalStackScope', id, state),
  };
};

const membershipRecord = async (
  ownerId: string,
  scope: LocalStackScope,
  work: LocalStackWorkReference,
  index: number,
  updatedAt: string,
): Promise<EncryptedEntityRecord> => {
  const scopeKey = localStackScopeKey(ownerId, scope);
  const id = `${scopeKey}:${referenceKey(work)}`;
  return {
    id,
    ownerId,
    scopeKey,
    workType: work.workType,
    workId: work.workId,
    membershipEpoch: work.membershipEpoch,
    updatedAt,
    value: await encryptLocalValue('personalStackMembership', id, { work, index }),
  };
};

const operationRecord = async (operation: LocalStackOperation): Promise<EncryptedEntityRecord> => ({
  id: operation.id,
  ownerId: operation.ownerId,
  scopeKey: operation.scopeKey,
  operationId: operation.operationId,
  mutationId: operation.mutationId,
  stackVersion: operation.version,
  updatedAt: operation.updatedAt,
  value: await encryptLocalValue('personalStackOperation', operation.id, operation),
});

function applyMove(
  work: readonly LocalStackWorkReference[],
  move: LocalStackMove,
): LocalStackWorkReference[] {
  return move.kind === 'simple_move'
    ? applySimpleMove(work, move)
    : applyFilteredPermutation(work, move);
}

export async function initializeLocalStack(input: {
  ownerId: string;
  scope: LocalStackScope;
  version: number;
  work: LocalStackWorkReference[];
}) {
  const updatedAt = new Date().toISOString();
  const state: LocalStackState = { ...input, work: [...input.work], updatedAt };
  const scopeKey = localStackScopeKey(input.ownerId, input.scope);
  const [storedScope, memberships, snapshotValue] = await Promise.all([
    scopeRecord(state),
    Promise.all(
      input.work.map((work, index) =>
        membershipRecord(input.ownerId, input.scope, work, index, updatedAt),
      ),
    ),
    encryptLocalValue('personalStackSnapshot', `${scopeKey}:snapshot:1`, {
      ownerId: input.ownerId,
      scope: input.scope,
      generation: 1,
      throughVersion: input.version,
      work: input.work,
    }),
  ]);
  const snapshot: EncryptedEntityRecord = {
    id: `${scopeKey}:snapshot:1`,
    ownerId: input.ownerId,
    scopeKey,
    generation: 1,
    chunkIndex: 0,
    updatedAt,
    value: snapshotValue,
  };
  const priorMemberships = await db.secureStackMemberships
    .where('scopeKey')
    .equals(scopeKey)
    .toArray();
  await db.transaction(
    'rw',
    db.secureStackScopes,
    db.secureStackMemberships,
    db.secureStackSnapshots,
    async () => {
      await db.secureStackScopes.put(storedScope);
      if (priorMemberships.length)
        await db.secureStackMemberships.bulkDelete(priorMemberships.map((item) => item.id));
      await db.secureStackMemberships.bulkPut(memberships);
      await db.secureStackSnapshots.put(snapshot);
    },
  );
  return state;
}

export async function readLocalStack(ownerId: string, scope: LocalStackScope) {
  const id = localStackScopeKey(ownerId, scope);
  const record = await db.secureStackScopes.get(id);
  return record
    ? decryptLocalValue<LocalStackState>('personalStackScope', record.id, record.value)
    : undefined;
}

export async function reorderLocalStack(input: {
  ownerId: string;
  scope: LocalStackScope;
  baseVersion: number;
  sourceClientId: string;
  move: LocalStackMove;
}) {
  const current = await readLocalStack(input.ownerId, input.scope);
  if (!current) throw new Error('Personal stack is unavailable.');
  if (current.version !== input.baseVersion) throw new Error('Personal stack version changed.');
  const now = new Date().toISOString();
  const operationId = createUlid();
  const mutationId = createUlid();
  const scopeKey = localStackScopeKey(input.ownerId, input.scope);
  const next: LocalStackState = {
    ...current,
    version: current.version + 1,
    work: applyMove(current.work, input.move),
    updatedAt: now,
  };
  const operation: LocalStackOperation = {
    id: operationId,
    operationId,
    mutationId,
    ownerId: input.ownerId,
    scope: input.scope,
    scopeKey,
    baseVersion: input.baseVersion,
    version: next.version,
    sourceClientId: input.sourceClientId,
    move: input.move,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const [storedScope, storedOperation, payload] = await Promise.all([
    scopeRecord(next),
    operationRecord(operation),
    encryptLocalValue('mutation', mutationId, {
      scope: input.scope.scopeType,
      baseVersion: input.baseVersion,
      move: input.move,
    }),
  ]);
  const [priorMemberships, memberships] = await Promise.all([
    db.secureStackMemberships.where('scopeKey').equals(scopeKey).toArray(),
    Promise.all(
      next.work.map((work, index) =>
        membershipRecord(input.ownerId, input.scope, work, index, now),
      ),
    ),
  ]);
  const mutation = {
    id: mutationId,
    entityId: scopeKey,
    entityType: 'personalStackOperation',
    operation: 'reorder',
    baseVersion: input.baseVersion,
    payload,
    createdAt: now,
    attempts: 0,
    ownerId: input.ownerId,
  } as unknown as StoredMutation;
  await db.transaction(
    'rw',
    db.secureStackScopes,
    db.secureStackMemberships,
    db.secureStackOperations,
    db.outbox,
    async () => {
      await db.secureStackScopes.put(storedScope);
      if (priorMemberships.length)
        await db.secureStackMemberships.bulkDelete(priorMemberships.map((item) => item.id));
      await db.secureStackMemberships.bulkPut(memberships);
      await db.secureStackOperations.put(storedOperation);
      await db.outbox.add(mutation);
    },
  );
  return { operationId, mutationId, status: 'pending' as const, version: next.version };
}

async function readOperations(ownerId?: string) {
  const records = ownerId
    ? await db.secureStackOperations.where('ownerId').equals(ownerId).toArray()
    : await db.secureStackOperations.toArray();
  return Promise.all(
    records.map((record) =>
      decryptLocalValue<LocalStackOperation>('personalStackOperation', record.id, record.value),
    ),
  );
}

export async function listPendingStackOperations(ownerId: string) {
  const [operations, pendingMutations] = await Promise.all([
    readOperations(ownerId),
    db.outbox.toArray(),
  ]);
  const pendingIds = new Set(pendingMutations.map((item) => item.id));
  return operations.filter(
    (operation) => operation.status === 'pending' && pendingIds.has(operation.mutationId),
  );
}

/** The latest time this browser received a successful server acknowledgement for stack work. */
export async function latestAppliedStackOperationAt(ownerId: string) {
  const applied = (await readOperations(ownerId)).filter(
    (operation) => operation.status === 'applied',
  );
  return applied.reduce<string | undefined>(
    (latest, operation) => (!latest || operation.updatedAt > latest ? operation.updatedAt : latest),
    undefined,
  );
}

export async function acknowledgeLocalStackOperation(result: {
  mutationId: string;
  operationId?: string;
  status: 'applied' | 'alreadyApplied' | 'duplicate';
  version?: number;
}) {
  const operation = (await readOperations()).find(
    (candidate) => candidate.mutationId === result.mutationId,
  );
  if (!operation) return;
  const updated: LocalStackOperation = {
    ...operation,
    operationId: result.operationId ?? operation.operationId,
    status: 'applied',
    version: result.version ?? operation.version,
    updatedAt: new Date().toISOString(),
  };
  await db.transaction('rw', db.secureStackOperations, db.outbox, async () => {
    await db.secureStackOperations.put(await operationRecord(updated));
    await db.outbox.delete(result.mutationId);
  });
}

export async function applyOwnerStackChange(change: {
  id: string;
  mutationId: string;
  userId: string;
  scopeType: 'overall' | 'project';
  scopeId?: string;
  baseVersion: number;
  version: number;
  kind: LocalStackMove['kind'];
  movedWork: LocalStackWorkReference;
  beforeWork?: LocalStackWorkReference;
  afterWork?: LocalStackWorkReference;
  destinationIndex?: number;
  affectedWork?: LocalStackWorkReference[];
  filterBasis?: Extract<PersonalStackMove, { kind: 'filtered_permutation' }>['filterBasis'];
  sourceClientId: string;
  acceptedAt: string;
}) {
  const scope: LocalStackScope =
    change.scopeType === 'project'
      ? { scopeType: 'project', scopeId: change.scopeId! }
      : { scopeType: 'overall' };
  const current = await readLocalStack(change.userId, scope);
  if (!current) throw new Error('Personal stack is unavailable.');
  const existingOperation = (await readOperations(change.userId)).find(
    (operation) => operation.id === change.id || operation.mutationId === change.mutationId,
  );
  if (existingOperation || change.version <= current.version) return current;
  if (current.version !== change.baseVersion) throw new Error('Personal stack version changed.');
  const move: LocalStackMove =
    change.kind === 'filtered_permutation'
      ? {
          kind: 'filtered_permutation',
          movedWork: change.movedWork,
          destinationIndex: change.destinationIndex!,
          affectedWork: change.affectedWork ?? [],
          ...(change.filterBasis ? { filterBasis: change.filterBasis } : {}),
        }
      : {
          kind: 'simple_move',
          movedWork: change.movedWork,
          ...(change.beforeWork ? { beforeWork: change.beforeWork } : {}),
          ...(change.afterWork ? { afterWork: change.afterWork } : {}),
        };
  const next: LocalStackState = {
    ...current,
    version: change.version,
    work: applyMove(current.work, move),
    updatedAt: change.acceptedAt,
  };
  const operation: LocalStackOperation = {
    id: change.id,
    operationId: change.id,
    mutationId: change.mutationId,
    ownerId: change.userId,
    scope,
    scopeKey: localStackScopeKey(change.userId, scope),
    baseVersion: change.baseVersion,
    version: change.version,
    sourceClientId: change.sourceClientId,
    move,
    status: 'applied',
    createdAt: change.acceptedAt,
    updatedAt: change.acceptedAt,
  };
  const scopeKey = localStackScopeKey(change.userId, scope);
  const [storedScope, storedOperation, priorMemberships, memberships] = await Promise.all([
    scopeRecord(next),
    operationRecord(operation),
    db.secureStackMemberships.where('scopeKey').equals(scopeKey).toArray(),
    Promise.all(
      next.work.map((work, index) =>
        membershipRecord(change.userId, scope, work, index, change.acceptedAt),
      ),
    ),
  ]);
  await db.transaction(
    'rw',
    db.secureStackScopes,
    db.secureStackMemberships,
    db.secureStackOperations,
    async () => {
      await db.secureStackScopes.put(storedScope);
      if (priorMemberships.length)
        await db.secureStackMemberships.bulkDelete(priorMemberships.map((item) => item.id));
      await db.secureStackMemberships.bulkPut(memberships);
      await db.secureStackOperations.put(storedOperation);
    },
  );
  return next;
}

export async function recordLocalStackConflict(input: Omit<LocalStackConflict, 'id'>) {
  const conflict: LocalStackConflict = { id: createUlid(), ...input };
  await db.secureStackConflicts.put({
    id: conflict.id,
    ownerId: conflict.ownerId,
    scopeKey: conflict.scopeKey,
    operationId: conflict.operationId,
    updatedAt: conflict.createdAt,
    value: await encryptLocalValue('personalStackConflict', conflict.id, conflict),
  });
  return conflict;
}

export async function conflictLocalStackOperation(input: {
  mutationId: string;
  reason: LocalStackConflict['reason'];
  currentVersion: number;
}) {
  const operation = (await readOperations()).find(
    (candidate) => candidate.mutationId === input.mutationId,
  );
  if (!operation) return;
  const now = new Date().toISOString();
  const conflict: LocalStackConflict = {
    id: createUlid(),
    ownerId: operation.ownerId,
    scope: operation.scope,
    scopeKey: operation.scopeKey,
    operationId: operation.operationId,
    mutationId: operation.mutationId,
    reason: input.reason,
    baseVersion: operation.baseVersion,
    currentVersion: input.currentVersion,
    move: operation.move,
    sourceClientId: operation.sourceClientId,
    createdAt: now,
  };
  const conflictedOperation: LocalStackOperation = {
    ...operation,
    status: 'conflict',
    updatedAt: now,
  };
  const storedConflict: EncryptedEntityRecord = {
    id: conflict.id,
    ownerId: conflict.ownerId,
    scopeKey: conflict.scopeKey,
    operationId: conflict.operationId,
    updatedAt: now,
    value: await encryptLocalValue('personalStackConflict', conflict.id, conflict),
  };
  await db.transaction(
    'rw',
    db.secureStackOperations,
    db.secureStackConflicts,
    db.outbox,
    async () => {
      await db.secureStackOperations.put(await operationRecord(conflictedOperation));
      await db.secureStackConflicts.put(storedConflict);
      await db.outbox.delete(input.mutationId);
    },
  );
  return conflict;
}

export async function listLocalStackConflicts(ownerId: string) {
  const records = await db.secureStackConflicts.where('ownerId').equals(ownerId).toArray();
  return Promise.all(
    records.map((record) =>
      decryptLocalValue<LocalStackConflict>('personalStackConflict', record.id, record.value),
    ),
  );
}

export async function resolveLocalStackConflict(
  conflictId: string,
  resolution: 'discard' | 'reapply',
) {
  const record = await db.secureStackConflicts.get(conflictId);
  if (!record) return;
  const conflict = await decryptLocalValue<LocalStackConflict>(
    'personalStackConflict',
    record.id,
    record.value,
  );
  if (resolution === 'discard') {
    await db.secureStackConflicts.delete(conflictId);
    return;
  }
  const current = await readLocalStack(conflict.ownerId, conflict.scope);
  if (!current) throw new Error('Personal stack is unavailable.');
  if (current.version !== conflict.currentVersion)
    await db.secureStackScopes.put(
      await scopeRecord({
        ...current,
        version: conflict.currentVersion,
        updatedAt: conflict.createdAt,
      }),
    );
  const pending = await reorderLocalStack({
    ownerId: conflict.ownerId,
    scope: conflict.scope,
    baseVersion: conflict.currentVersion,
    sourceClientId: conflict.sourceClientId,
    move: conflict.move,
  });
  await db.secureStackConflicts.delete(conflictId);
  return pending;
}

export async function purgeLocalPersonalStack(ownerId: string) {
  const ownerStores = [
    db.secureStackScopes,
    db.secureStackMemberships,
    db.secureStackOperations,
    db.secureStackOperationChunks,
    db.secureStackSnapshots,
    db.secureStackConflicts,
  ];
  const idsByStore = await Promise.all(
    ownerStores.map(async (store) =>
      (await store.where('ownerId').equals(ownerId).toArray()).map((record) => record.id),
    ),
  );
  const pending = (await db.outbox.toArray()).filter(
    (mutation) => (mutation as StoredMutation & { ownerId?: string }).ownerId === ownerId,
  );
  await db.transaction('rw', [...ownerStores, db.outbox], async () => {
    await Promise.all(ownerStores.map((store, index) => store.bulkDelete(idsByStore[index] ?? [])));
    if (pending.length) await db.outbox.bulkDelete(pending.map((mutation) => mutation.id));
  });
}

export async function removeLocalStackMembership(
  ownerId: string,
  workType: LocalStackWorkReference['workType'],
  workId: string,
) {
  const records = await db.secureStackScopes.where('ownerId').equals(ownerId).toArray();
  for (const record of records) {
    const state = await decryptLocalValue<LocalStackState>(
      'personalStackScope',
      record.id,
      record.value,
    );
    const retained = state.work.filter(
      (work) => work.workType !== workType || work.workId !== workId,
    );
    if (retained.length !== state.work.length)
      await initializeLocalStack({
        ownerId,
        scope: state.scope,
        version: state.version,
        work: retained,
      });
  }
}
