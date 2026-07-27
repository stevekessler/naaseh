import { z } from 'zod';

const taskSchema = z.object({
  id: z.string().min(1).max(1024),
  etag: z.string().max(2048).optional(),
  title: z.string().max(1024).default(''),
  updated: z.string().datetime().optional(),
  due: z.string().datetime().optional(),
  completed: z.string().datetime().optional(),
  deleted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  status: z.enum(['needsAction', 'completed']).default('needsAction'),
  notes: z.string().max(8192).optional(),
});

const taskListSchema = z.object({
  id: z.string().min(1).max(1024),
  etag: z.string().max(2048).optional(),
  title: z.string().min(1).max(1024),
  updated: z.string().datetime().optional(),
});

const taskPageSchema = z.object({
  nextPageToken: z.string().max(4096).optional(),
  items: z.array(taskSchema).default([]),
});
const taskListPageSchema = z.object({
  nextPageToken: z.string().max(4096).optional(),
  items: z.array(taskListSchema).default([]),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.literal('Bearer').optional(),
});

export type GoogleTask = z.infer<typeof taskSchema>;
export type GoogleTaskList = z.infer<typeof taskListSchema>;
export type GoogleTokenResponse = z.infer<typeof tokenSchema>;

export class GoogleProviderError extends Error {
  constructor(
    readonly safeCode: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly unknownOutcome = false,
  ) {
    super('Google Tasks could not complete the request.');
    this.name = 'GoogleProviderError';
  }
}

export interface GoogleClientOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxReadAttempts?: number;
}

const statusClass = (status: number) => `${Math.floor(status / 100)}xx`;

export class GoogleTasksClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxReadAttempts: number;

  constructor(
    private readonly accessToken: string,
    options: GoogleClientOptions = {},
  ) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxReadAttempts = options.maxReadAttempts ?? 3;
  }

  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    init: RequestInit = {},
    retrySafe = true,
  ): Promise<z.output<S>> {
    const attempts = retrySafe ? this.maxReadAttempts : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(`https://tasks.googleapis.com${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.accessToken}`,
            accept: 'application/json',
            ...(init.body ? { 'content-type': 'application/json' } : {}),
            ...init.headers,
          },
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 100 * 2 ** attempt)));
            continue;
          }
          throw new GoogleProviderError(
            response.status === 401
              ? 'google_reauthorization_required'
              : `google_${statusClass(response.status)}`,
            response.status,
            retryable,
            !retrySafe && retryable,
          );
        }
        if (response.status === 204) return undefined as z.output<S>;
        return schema.parse(await response.json());
      } catch (error) {
        if (error instanceof GoogleProviderError || error instanceof z.ZodError) throw error;
        if (attempt < attempts) continue;
        throw new GoogleProviderError('google_network_failure', 0, true, !retrySafe);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new GoogleProviderError('google_retry_exhausted', 0, true);
  }

  async listTaskLists() {
    const items: GoogleTaskList[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.request(`/tasks/v1/users/@me/lists?${params}`, taskListPageSchema);
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  createTaskList(title: string) {
    return this.request(
      '/tasks/v1/users/@me/lists',
      taskListSchema,
      { method: 'POST', body: JSON.stringify({ title: title.slice(0, 1024) }) },
      false,
    );
  }

  async listTasks(taskListId: string, options: { updatedMin?: string; pageToken?: string } = {}) {
    const params = new URLSearchParams({
      maxResults: '100',
      showCompleted: 'true',
      showHidden: 'true',
      showDeleted: 'true',
    });
    if (options.updatedMin) params.set('updatedMin', options.updatedMin);
    if (options.pageToken) params.set('pageToken', options.pageToken);
    return this.request(
      `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${params}`,
      taskPageSchema,
    );
  }

  getTask(taskListId: string, taskId: string) {
    return this.request(
      `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      taskSchema,
    );
  }

  createTask(
    taskListId: string,
    input: { title: string; dueDate: string; status?: 'needsAction' | 'completed'; notes?: string },
  ) {
    return this.request(
      `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
      taskSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          title: input.title.slice(0, 1024),
          due: `${input.dueDate}T00:00:00.000Z`,
          status: input.status ?? 'needsAction',
          ...(input.notes ? { notes: input.notes.slice(0, 8192) } : {}),
        }),
      },
      false,
    );
  }

  patchTask(
    taskListId: string,
    taskId: string,
    input: Partial<{
      title: string;
      dueDate: string;
      status: 'needsAction' | 'completed';
      notes: string;
    }>,
  ) {
    return this.request(
      `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      taskSchema,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(input.title !== undefined ? { title: input.title.slice(0, 1024) } : {}),
          ...(input.dueDate !== undefined ? { due: `${input.dueDate}T00:00:00.000Z` } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes.slice(0, 8192) } : {}),
        }),
      },
    );
  }

  deleteTask(taskListId: string, taskId: string) {
    return this.request(
      `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      z.undefined(),
      { method: 'DELETE' },
    );
  }

  async findMarker(taskListId: string, marker: string) {
    let pageToken: string | undefined;
    do {
      const page = await this.listTasks(taskListId, { ...(pageToken ? { pageToken } : {}) });
      const match = (page.items ?? []).find((task) => task.notes?.split(/\r?\n/).includes(marker));
      if (match) return match;
      pageToken = page.nextPageToken;
    } while (pageToken);
    return undefined;
  }
}

async function oauthRequest(
  url: string,
  body: URLSearchParams,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  if (!response.ok)
    throw new GoogleProviderError(
      response.status === 400
        ? 'google_oauth_rejected'
        : `google_oauth_${statusClass(response.status)}`,
      response.status,
      response.status === 429 || response.status >= 500,
    );
  return tokenSchema.parse(await response.json());
}

export const exchangeGoogleAuthorizationCode = (input: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetch?: typeof globalThis.fetch;
}) =>
  oauthRequest(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
    input.fetch,
  );

export const refreshGoogleAccessToken = (input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof globalThis.fetch;
}) =>
  oauthRequest(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }),
    input.fetch,
  );

export async function revokeGoogleToken(
  token: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
) {
  const response = await fetcher('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok && response.status !== 400)
    throw new GoogleProviderError('google_revoke_failed', response.status, response.status >= 500);
}
