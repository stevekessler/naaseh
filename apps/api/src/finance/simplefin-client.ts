import { isIP } from 'node:net';

const MAX_TOKEN_LENGTH = 4_096;
const MAX_URL_LENGTH = 2_048;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function validateBridgeUrl(value: string | URL, allowedHosts: readonly string[]): URL {
  const raw = value.toString();
  if (raw.length > MAX_URL_LENGTH) throw new Error('SimpleFIN URL exceeds the size limit.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid SimpleFIN URL.');
  }
  if (url.protocol !== 'https:') throw new Error('SimpleFIN URL must use HTTPS.');
  if (url.port && url.port !== '443') throw new Error('SimpleFIN URL must use port 443.');
  if (isIP(url.hostname) || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error('SimpleFIN Bridge host is not allowed.');
  }
  return url;
}

export function validateSimplefinClaimUrl(value: string, allowedHosts: readonly string[]): URL {
  const url = validateBridgeUrl(value, allowedHosts);
  if (url.username || url.password)
    throw new Error('SimpleFIN claim URL credentials are not accepted.');
  return url;
}

/** Bridge Access URLs intentionally contain HTTP Basic credentials and must remain server-only. */
export function validateSimplefinAccessUrl(value: string, allowedHosts: readonly string[]): URL {
  const url = validateBridgeUrl(value, allowedHosts);
  if (!url.username || !url.password)
    throw new Error('SimpleFIN Bridge Access URL credentials are required.');
  return url;
}

export function decodeAndValidateSetupToken(token: string, allowedHosts: readonly string[]): URL {
  if (!token || token.length > MAX_TOKEN_LENGTH)
    throw new Error('SimpleFIN setup token exceeds the size limit.');
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    throw new Error('Invalid SimpleFIN setup token.');
  }
  return validateSimplefinClaimUrl(decoded, allowedHosts);
}

export function sanitizedSimplefinError(status: number) {
  if (status === 401 || status === 403)
    return { errorClass: 'provider-authentication', retryable: false } as const;
  if (status === 402) return { errorClass: 'provider-payment-required', retryable: false } as const;
  if (status === 429) return { errorClass: 'provider-throttled', retryable: true } as const;
  return { errorClass: 'provider-unavailable', retryable: status >= 500 } as const;
}

async function boundedText(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new Error('SimpleFIN response exceeds the size limit.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error('SimpleFIN response exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
}

async function fetchBridge(
  initialUrl: URL,
  allowedHosts: readonly string[],
  fetcher: typeof fetch,
  init: RequestInit,
  authenticatedHost?: string,
) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetcher(url, { ...init, redirect: 'manual' });
    if (!redirectStatuses.has(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || redirects === 3)
      throw new Error('SimpleFIN redirect could not be followed safely.');
    const next = validateBridgeUrl(new URL(location, url), allowedHosts);
    if (next.username || next.password)
      throw new Error('SimpleFIN redirect contains unexpected credentials.');
    if (authenticatedHost && next.hostname.toLowerCase() !== authenticatedHost) {
      throw new Error('SimpleFIN authenticated redirects cannot change hosts.');
    }
    url = next;
  }
  throw new Error('SimpleFIN redirect limit exceeded.');
}

export async function claimSimplefinAccessUrl(
  setupToken: string,
  allowedHosts: readonly string[],
  fetcher: typeof fetch = fetch,
  maximumBytes = 4_096,
): Promise<string> {
  const claimUrl = decodeAndValidateSetupToken(setupToken, allowedHosts);
  const response = await fetchBridge(claimUrl, allowedHosts, fetcher, {
    method: 'POST',
    headers: { 'content-length': '0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      `SimpleFIN claim failed (${sanitizedSimplefinError(response.status).errorClass}).`,
    );
  const accessUrl = (await boundedText(response, maximumBytes)).trim();
  return validateSimplefinAccessUrl(accessUrl, allowedHosts).toString();
}

export interface SimplefinAccountWindow {
  startDate: string;
  endDate: string;
}

export async function fetchSimplefinAccounts(
  accessUrl: string,
  allowedHosts: readonly string[],
  fetcher: typeof fetch = fetch,
  maximumBytes = 5_000_000,
  window?: SimplefinAccountWindow,
): Promise<unknown> {
  const url = validateSimplefinAccessUrl(accessUrl, allowedHosts);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const authenticatedHost = url.hostname.toLowerCase();
  url.username = '';
  url.password = '';
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/accounts`;
  url.search = '';
  url.searchParams.set('version', '2');
  url.searchParams.set('pending', '1');
  if (window) {
    const start = Date.parse(`${window.startDate}T00:00:00.000Z`);
    const end = Date.parse(`${window.endDate}T00:00:00.000Z`);
    const days = (end - start) / 86_400_000;
    if (!Number.isFinite(days) || days < 0 || days > 90)
      throw new Error('SimpleFIN request window must be at most 90 days.');
    url.searchParams.set('start-date', String(Math.floor(start / 1_000)));
    url.searchParams.set('end-date', String(Math.floor(end / 1_000)));
  }
  const response = await fetchBridge(
    url,
    allowedHosts,
    fetcher,
    {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: 'application/json',
        authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
      },
    },
    authenticatedHost,
  );
  if (!response.ok)
    throw new Error(
      `SimpleFIN request failed (${sanitizedSimplefinError(response.status).errorClass}).`,
    );
  return JSON.parse(await boundedText(response, maximumBytes)) as unknown;
}
