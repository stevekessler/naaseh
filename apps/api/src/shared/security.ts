import { createHash, timingSafeEqual } from 'node:crypto';
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
export function validOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  // Local HTTP is permitted only outside production so an unset deployment
  // variable never silently changes into "trust every HTTPS website".
  return (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
  );
}
export function validCsrf(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(provided).digest();
  return timingSafeEqual(a, b);
}
export function requireMutationSecurity(
  origin: string | undefined,
  expectedCsrf: string,
  providedCsrf: string | undefined,
): void {
  if (!validOrigin(origin) || !validCsrf(expectedCsrf, providedCsrf))
    throw Object.assign(new Error('Request rejected.'), { statusCode: 403, code: 'forbidden' });
}
