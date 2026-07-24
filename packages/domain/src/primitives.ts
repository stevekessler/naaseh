import { z } from 'zod';
const ulidAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Expected a canonical ULID.');
function encodeUlidTime(value: number): string {
  let result = '';
  for (let index = 0; index < 10; index += 1) {
    result = ulidAlphabet[value % 32] + result;
    value = Math.floor(value / 32);
  }
  return result;
}
/** Create a sortable, browser-and-Lambda-safe ULID without an extra runtime dependency. */
export function createUlid(
  now = Date.now(),
  random = crypto.getRandomValues(new Uint8Array(16)),
): string {
  let randomness = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of random) {
    buffer = buffer * 256 + byte;
    bits += 8;
    while (bits >= 5 && randomness.length < 16) {
      bits -= 5;
      randomness += ulidAlphabet[Math.floor(buffer / 2 ** bits) % 32];
      buffer %= 2 ** bits;
    }
  }
  while (randomness.length < 16) randomness += ulidAlphabet[0];
  return ulidSchema.parse(`${encodeUlidTime(now)}${randomness}`);
}
export const timestampSchema = z.string().datetime();
export const versionSchema = z.number().int().positive();
export const actorSchema = z.object({ id: z.string().min(1), role: z.enum(['admin', 'user']) });
