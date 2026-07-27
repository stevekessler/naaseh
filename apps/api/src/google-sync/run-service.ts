import {
  createUlid,
  googleConnectionSchema,
  googleSyncRunSchema,
  type GoogleConnection,
  type GoogleSyncOperation,
  type GoogleSyncRun,
} from '@naaseh/domain';
import { listOwnerTasks } from '../shared/store.js';
import { findTask } from '../tasks/task-repository.js';
import { googleClientForConnection } from './auth-service.js';
import { GoogleProviderError } from './google-client.js';
import { importGoogleTask } from './import-service.js';
import {
  isGoogleTaskEligible,
  publishGoogleTask,
  retireIneligibleGoogleTask,
} from './publish-service.js';
import {
  acquireGoogleRunLease,
  findGoogleTaskLink,
  listGoogleOperations,
  releaseGoogleRunLease,
  saveGoogleOperation,
  saveGoogleConnection,
  saveGoogleRun,
  transitionGoogleOperation,
} from './repository.js';
import { recordGoogleSyncEvent, recordGoogleSyncMetric } from './telemetry.js';
import { taskSnapshot } from './merge-service.js';

const runTtl = (date: Date) => Math.floor(date.getTime() / 1000) + 90 * 24 * 60 * 60;
const dueRetry = (operation: GoogleSyncOperation, now: Date) =>
  !operation.nextAttemptAt || new Date(operation.nextAttemptAt) <= now;

export const googleRetryDelayMs = (attempt: number, jitter = Math.random()) =>
  Math.min(15 * 60_000, 1000 * 2 ** attempt) + Math.floor(jitter * 1000);

export const googleCheckpointStalled = (
  checkpointAt: string | undefined,
  now: Date,
  thresholdMinutes = 10,
) =>
  Boolean(
    checkpointAt && now.getTime() - new Date(checkpointAt).getTime() > thresholdMinutes * 60_000,
  );

const operationResult = (
  operation: GoogleSyncOperation,
  state: GoogleSyncOperation['state'],
  now: Date,
  fields: Partial<GoogleSyncOperation> = {},
) => ({ ...operation, ...fields, state, updatedAt: now.toISOString() });

async function processLocalOperations(connection: GoogleConnection, now: Date) {
  const client = await googleClientForConnection(connection);
  const pending = [
    ...(await listGoogleOperations(connection.id, 'pending')),
    ...(await listGoogleOperations(connection.id, 'retry')),
  ].filter((operation) => dueRetry(operation, now));
  let succeeded = 0;
  let quarantined = 0;
  for (const operation of pending) {
    const running = operationResult(operation, 'running', now, {
      attemptCount: operation.attemptCount + 1,
    });
    await transitionGoogleOperation(operation, running);
    try {
      if (operation.direction === 'fromGoogle') {
        if (!connection.selectedTaskListId || !operation.googleTaskId)
          throw new Error('Inbound retry has no Google task identity.');
        const remote = await client.getTask(connection.selectedTaskListId, operation.googleTaskId);
        await importGoogleTask({ connection, remote, client, now });
        await transitionGoogleOperation(running, operationResult(running, 'succeeded', now));
        succeeded += 1;
        continue;
      }
      const task = operation.taskId ? await findTask(operation.taskId) : undefined;
      if (!task) {
        await transitionGoogleOperation(running, operationResult(running, 'cancelled', now));
        continue;
      }
      const link = await findGoogleTaskLink(task.id);
      const snapshot = taskSnapshot(task);
      if (link && snapshot && JSON.stringify(link.base) === JSON.stringify(snapshot)) {
        await transitionGoogleOperation(running, operationResult(running, 'cancelled', now));
        continue;
      }
      if (await isGoogleTaskEligible(task, connection))
        await publishGoogleTask({ connection, task, client, now });
      else await retireIneligibleGoogleTask({ connection, task, client, now });
      await transitionGoogleOperation(running, operationResult(running, 'succeeded', now));
      succeeded += 1;
    } catch (error) {
      const provider = error instanceof GoogleProviderError ? error : undefined;
      const retryable = provider?.retryable ?? false;
      const attempts = running.attemptCount;
      if (retryable && attempts < 6) {
        const delay = googleRetryDelayMs(attempts);
        await transitionGoogleOperation(
          running,
          operationResult(running, 'retry', now, {
            nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
            safeErrorCode: provider?.safeCode ?? 'google_local_operation_failed',
            providerStatusClass: provider?.status
              ? `${Math.floor(provider.status / 100)}xx`
              : undefined,
          }),
        );
      } else {
        await transitionGoogleOperation(
          running,
          operationResult(running, 'quarantined', now, {
            safeErrorCode: provider?.safeCode ?? 'google_local_operation_invalid',
            providerStatusClass: provider?.status
              ? `${Math.floor(provider.status / 100)}xx`
              : undefined,
          }),
        );
        quarantined += 1;
      }
    }
  }
  return { succeeded, quarantined };
}

async function publishInitialLocalTasks(connection: GoogleConnection, now: Date) {
  if (connection.checkpointAt) return 0;
  const client = await googleClientForConnection(connection);
  let count = 0;
  for (const task of await listOwnerTasks(connection.userId)) {
    const result = await publishGoogleTask({ connection, task, client, now });
    if (result.outcome === 'created' || result.outcome === 'recovered') count += 1;
  }
  return count;
}

async function processRemoteChanges(connection: GoogleConnection, now: Date) {
  if (!connection.selectedTaskListId) throw new Error('Google task list is not selected.');
  const client = await googleClientForConnection(connection);
  const overlapFrom = connection.checkpointAt
    ? new Date(
        new Date(connection.checkpointAt).getTime() - connection.overlapMinutes * 60_000,
      ).toISOString()
    : undefined;
  let pageToken: string | undefined;
  let imported = 0;
  let skippedUndated = 0;
  let conflicts = 0;
  let quarantined = 0;
  do {
    const page = await client.listTasks(connection.selectedTaskListId, {
      ...(overlapFrom ? { updatedMin: overlapFrom } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const remote of page.items ?? []) {
      try {
        const result = await importGoogleTask({ connection, remote, client, now });
        if (result.outcome === 'imported' || result.outcome === 'merged') imported += 1;
        if (result.outcome === 'skippedUndated') skippedUndated += 1;
        if (result.outcome === 'conflicted') conflicts += result.conflicts.length;
      } catch (error) {
        quarantined += 1;
        const updatedAt = now.toISOString();
        await saveGoogleOperation({
          id: `remote:${connection.id}:${remote.id}:${remote.etag ?? remote.updated ?? 'unknown'}`.slice(
            0,
            300,
          ),
          connectionId: connection.id,
          userId: connection.userId,
          googleTaskId: remote.id,
          direction: 'fromGoogle',
          type: remote.deleted ? 'archive' : 'update',
          providerRevision: remote.etag ?? remote.updated,
          state: 'quarantined',
          attemptCount: 1,
          safeErrorCode:
            error instanceof GoogleProviderError ? error.safeCode : 'google_remote_item_invalid',
          providerStatusClass:
            error instanceof GoogleProviderError && error.status
              ? `${Math.floor(error.status / 100)}xx`
              : undefined,
          correlationId: `run:${connection.id}`,
          createdAt: updatedAt,
          updatedAt,
        });
        recordGoogleSyncEvent('remote_item', {
          correlationId: `run:${connection.id}`,
          connectionId: connection.id,
          outcome: 'quarantined',
          direction: 'fromGoogle',
          safeErrorCode:
            error instanceof GoogleProviderError ? error.safeCode : 'google_remote_item_invalid',
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { imported, skippedUndated, conflicts, quarantined };
}

export async function retryGoogleQuarantine(
  connection: GoogleConnection,
  operationId: string,
  now = new Date(),
) {
  const operation = (await listGoogleOperations(connection.id, 'quarantined')).find(
    (candidate) => candidate.id === operationId,
  );
  if (!operation) return undefined;
  return transitionGoogleOperation(operation, {
    ...operation,
    state: 'retry',
    nextAttemptAt: now.toISOString(),
    safeErrorCode: undefined,
    providerStatusClass: undefined,
    updatedAt: now.toISOString(),
  });
}

export async function runGoogleSynchronization(input: {
  connection: GoogleConnection;
  trigger: 'scheduled' | 'manual' | 'initial' | 'disconnect';
  now?: Date;
  queuedRun?: GoogleSyncRun;
}) {
  const now = input.now ?? new Date();
  const runId = input.queuedRun?.id ?? createUlid(now.getTime());
  const leaseExpiresAt = new Date(now.getTime() + 12 * 60_000).toISOString();
  const connection = await acquireGoogleRunLease(
    input.connection.userId,
    runId,
    leaseExpiresAt,
    now.toISOString(),
  );
  const run = googleSyncRunSchema.parse({
    ...(input.queuedRun ?? {
      id: runId,
      connectionId: connection.id,
      userId: connection.userId,
      trigger: input.trigger,
      counts: {},
      correlationId: `google-run:${runId}`,
      startedAt: now.toISOString(),
      expiresAt: runTtl(now),
    }),
    state: 'running',
    checkpointStart: connection.checkpointAt,
  });
  await saveGoogleRun(run);
  const started = performance.now();
  try {
    const publishedInitial = await publishInitialLocalTasks(connection, now);
    const outbound = await processLocalOperations(connection, now);
    const remote = await processRemoteChanges(connection, now);
    const completedAt = new Date();
    const nextConnection = googleConnectionSchema.parse({
      ...connection,
      checkpointAt: now.toISOString(),
      lastSuccessAt: completedAt.toISOString(),
      pendingCount: Math.max(0, connection.pendingCount - outbound.succeeded),
      conflictCount: connection.conflictCount + remote.conflicts,
      quarantineCount: connection.quarantineCount + remote.quarantined + outbound.quarantined,
      skippedUndatedCount: remote.skippedUndated,
      version: connection.version + 1,
      updatedAt: completedAt.toISOString(),
    });
    await saveGoogleConnection(nextConnection, connection.version);
    const completeRun = googleSyncRunSchema.parse({
      ...run,
      state: remote.quarantined || outbound.quarantined ? 'partial' : 'succeeded',
      checkpointEnd: now.toISOString(),
      counts: { publishedInitial, ...outbound, ...remote },
      completedAt: completedAt.toISOString(),
    });
    await saveGoogleRun(completeRun);
    recordGoogleSyncEvent('run', {
      correlationId: run.correlationId,
      connectionId: connection.id,
      runId,
      outcome: 'success',
      latencyMs: Math.round(performance.now() - started),
    });
    if (remote.conflicts) recordGoogleSyncMetric('GoogleSyncConflicts', remote.conflicts);
    recordGoogleSyncMetric(
      'GoogleSyncLagSeconds',
      Math.max(0, Math.round((completedAt.getTime() - now.getTime()) / 1000)),
    );
    if (remote.quarantined + outbound.quarantined)
      recordGoogleSyncMetric('GoogleSyncQuarantines', remote.quarantined + outbound.quarantined);
    await releaseGoogleRunLease(connection.userId, runId);
    return completeRun;
  } catch (error) {
    const failedAt = new Date();
    await saveGoogleRun(
      googleSyncRunSchema.parse({
        ...run,
        state: 'failed',
        counts: {},
        completedAt: failedAt.toISOString(),
      }),
    );
    const provider = error instanceof GoogleProviderError ? error : undefined;
    if (provider?.status === 429) {
      recordGoogleSyncMetric('GoogleSyncThrottles', 1);
      recordGoogleSyncEvent('quota', {
        correlationId: run.correlationId,
        connectionId: connection.id,
        runId,
        outcome: 'retry',
        safeErrorCode: provider.safeCode,
        providerStatusClass: '4xx',
      });
    }
    if (googleCheckpointStalled(connection.checkpointAt, now))
      recordGoogleSyncMetric('GoogleSyncCheckpointStalls', 1);
    if (provider?.safeCode === 'google_reauthorization_required') {
      const reauth = googleConnectionSchema.parse({
        ...connection,
        state: 'reauthRequired',
        version: connection.version + 1,
        updatedAt: failedAt.toISOString(),
      });
      await saveGoogleConnection(reauth, connection.version);
      recordGoogleSyncMetric('GoogleSyncRevocations', 1);
    } else {
      await releaseGoogleRunLease(connection.userId, runId).catch(() => undefined);
    }
    recordGoogleSyncMetric('GoogleSyncRunFailures', 1);
    recordGoogleSyncEvent('run', {
      correlationId: run.correlationId,
      connectionId: connection.id,
      runId,
      outcome: 'failure',
      latencyMs: Math.round(performance.now() - started),
      safeErrorCode: provider?.safeCode ?? 'google_run_failed',
    });
    throw error;
  }
}

export async function queueGoogleSynchronization(connection: GoogleConnection, now = new Date()) {
  const runId = createUlid(now.getTime());
  const run = googleSyncRunSchema.parse({
    id: runId,
    connectionId: connection.id,
    userId: connection.userId,
    trigger: 'manual',
    state: 'queued',
    checkpointStart: connection.checkpointAt,
    counts: {},
    correlationId: `google-run:${runId}`,
    startedAt: now.toISOString(),
    expiresAt: runTtl(now),
  });
  return saveGoogleRun(run);
}
