import { currentFinanceAccess } from './security/finance-access.js';
export interface FinanceProblemView {
  status: number;
  code: string;
  message: string;
  correlationId?: string;
}

export class FinanceClientError extends Error {
  constructor(readonly problem: FinanceProblemView) {
    super(problem.message);
    this.name = 'FinanceClientError';
  }
}

function safeProblem(value: unknown, status: number): FinanceProblemView {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    status,
    code: typeof candidate.code === 'string' ? candidate.code : 'FINANCE_REQUEST_FAILED',
    message:
      typeof candidate.title === 'string'
        ? candidate.title
        : 'The finance request could not be completed.',
    ...(typeof candidate.correlationId === 'string'
      ? { correlationId: candidate.correlationId }
      : {}),
  };
}

export async function financeRequest<T>(
  path: string,
  options: RequestInit & { csrfToken?: string; idempotencyKey?: string } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const access = currentFinanceAccess();
  return access.read(async (signal) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new FinanceClientError({
        status: 0,
        code: 'FINANCE_OFFLINE',
        message: 'Finance is offline. Saved encrypted changes remain on this device.',
      });
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (options.csrfToken) headers.set('x-csrf-token', options.csrfToken);
    if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
    for (const [name, value] of Object.entries(access.requestHeaders())) headers.set(name, value);
    const response = await fetcher(`/api/v1${path}`, {
      ...options,
      headers,
      signal,
      credentials: 'include',
      cache: 'no-store',
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = safeProblem(body, response.status);
      if (problem.code === 'finance_locked' || response.status === 401) await access.markStale();
      throw new FinanceClientError(problem);
    }
    return body as T;
  }, options.signal ?? undefined);
}
