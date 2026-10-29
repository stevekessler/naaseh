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
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.csrfToken) headers.set('x-csrf-token', options.csrfToken);
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
  const response = await fetcher(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new FinanceClientError(safeProblem(body, response.status));
  return body as T;
}
