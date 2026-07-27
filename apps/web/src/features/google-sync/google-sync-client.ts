import {
  googleConnectResponseSchema,
  googleConflictListSchema,
  googleSyncPreviewSchema,
  googleSyncStatusSchema,
  googleTaskListChoiceSchema,
  googleDisconnectPreviewSchema,
  googleQuarantineListSchema,
  googleSyncRunStatusSchema,
  type googleConflictResolutionSchema,
  type googleDisconnectRequestSchema,
  type googleSyncSettingsPatchSchema,
} from '@naaseh/contracts';
import { z } from 'zod';
import { db } from '../../db/database.js';
import { decryptLocalValue, encryptLocalValue } from '../../db/task-repository.js';

const statusCacheId = 'status';
const conflictsCacheId = 'conflicts';

async function putCache(id: string, value: unknown) {
  await db.secureGoogleSync.put({
    id,
    updatedAt: new Date().toISOString(),
    value: await encryptLocalValue('google-sync', id, value),
  });
}

async function getCache<T>(id: string, schema: z.ZodType<T>) {
  const record = await db.secureGoogleSync.get(id);
  if (!record) return undefined;
  return schema.parse(await decryptLocalValue('google-sync', id, record.value));
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  csrfToken: string,
  init: RequestInit = {},
) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Google synchronization could not complete the request.');
  }
  return schema.parse(await response.json());
}

export async function getGoogleSyncStatus(csrfToken: string) {
  if (!navigator.onLine) return getCache(statusCacheId, googleSyncStatusSchema);
  try {
    const status = await request(
      '/api/v1/integrations/google/status',
      googleSyncStatusSchema,
      csrfToken,
    );
    await putCache(statusCacheId, status);
    return status;
  } catch (error) {
    const cached = await getCache(statusCacheId, googleSyncStatusSchema);
    if (cached) return cached;
    throw error;
  }
}

export const startGoogleConnect = (csrfToken: string, defaultTimeZone: string) =>
  request('/api/v1/integrations/google/connect', googleConnectResponseSchema, csrfToken, {
    method: 'POST',
    body: JSON.stringify({ defaultTimeZone }),
  });

export const listGoogleTaskLists = (csrfToken: string) =>
  request('/api/v1/integrations/google/task-lists', z.array(googleTaskListChoiceSchema), csrfToken);

export const createGoogleTaskList = (csrfToken: string, title = "Na'aseh") =>
  request('/api/v1/integrations/google/task-lists', googleTaskListChoiceSchema, csrfToken, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

export const previewGoogleSync = (csrfToken: string, taskListId: string) =>
  request('/api/v1/integrations/google/preview', googleSyncPreviewSchema, csrfToken, {
    method: 'POST',
    body: JSON.stringify({ taskListId, publishExisting: true, importExisting: true }),
  });

export const updateGoogleSyncSettings = (
  csrfToken: string,
  input: z.input<typeof googleSyncSettingsPatchSchema>,
) =>
  request('/api/v1/integrations/google/settings', googleSyncStatusSchema, csrfToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const runGoogleSync = (csrfToken: string) =>
  request('/api/v1/integrations/google/sync', z.object({ runId: z.string() }), csrfToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const getGoogleSyncRun = (csrfToken: string, runId: string) =>
  request(
    `/api/v1/integrations/google/runs/${encodeURIComponent(runId)}`,
    googleSyncRunStatusSchema,
    csrfToken,
  );

export const listGoogleQuarantine = (csrfToken: string) =>
  request('/api/v1/integrations/google/quarantine', googleQuarantineListSchema, csrfToken);

export const retryGoogleQuarantine = (csrfToken: string, operationId: string) =>
  request(
    `/api/v1/integrations/google/quarantine/${encodeURIComponent(operationId)}/retry`,
    z.object({ retried: z.literal(true) }),
    csrfToken,
    { method: 'POST', body: JSON.stringify({ mutationId: crypto.randomUUID() }) },
  );

export async function listGoogleConflicts(csrfToken: string) {
  if (!navigator.onLine) return (await getCache(conflictsCacheId, googleConflictListSchema)) ?? [];
  try {
    const conflicts = await request(
      '/api/v1/integrations/google/conflicts',
      googleConflictListSchema,
      csrfToken,
    );
    await putCache(conflictsCacheId, conflicts);
    return conflicts;
  } catch (error) {
    const cached = await getCache(conflictsCacheId, googleConflictListSchema);
    if (cached) return cached;
    throw error;
  }
}

export async function refreshGoogleSyncCache(csrfToken: string) {
  if (!navigator.onLine) return;
  const status = await getGoogleSyncStatus(csrfToken);
  if (status && !['disconnected', 'connecting'].includes(status.state))
    await listGoogleConflicts(csrfToken);
}

export const resolveGoogleConflict = (
  csrfToken: string,
  conflictId: string,
  input: z.input<typeof googleConflictResolutionSchema>,
) =>
  request(
    `/api/v1/integrations/google/conflicts/${encodeURIComponent(conflictId)}`,
    z.object({ resolved: z.literal(true) }),
    csrfToken,
    { method: 'POST', body: JSON.stringify(input) },
  );

export const disconnectGoogle = (
  csrfToken: string,
  input: z.input<typeof googleDisconnectRequestSchema>,
) =>
  request('/api/v1/integrations/google/disconnect', z.object({ runId: z.string() }), csrfToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const setPrivateTaskGoogleSharing = (
  csrfToken: string,
  taskId: string,
  approved: boolean,
  expectedVersion: number,
) =>
  request(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/google-sharing`,
    z.object({ approved: z.boolean(), version: z.number().int().positive() }),
    csrfToken,
    {
      method: 'PUT',
      body: JSON.stringify({ approved, expectedVersion, mutationId: crypto.randomUUID() }),
    },
  );

export const previewGoogleDisconnect = (csrfToken: string) =>
  request(
    '/api/v1/integrations/google/disconnect-preview',
    googleDisconnectPreviewSchema,
    csrfToken,
  );
