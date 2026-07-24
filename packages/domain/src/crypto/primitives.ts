const encodeBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
export const randomBase64Url = (bytes = 32) =>
  encodeBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (value: string | Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof value === 'string' ? new TextEncoder().encode(value) : value,
      ),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
export const canonicalAad = (parts: Record<string, string | number>) =>
  new TextEncoder().encode(
    Object.keys(parts)
      .sort()
      .map((key) => `${key}=${parts[key]}`)
      .join('&'),
  );
export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
