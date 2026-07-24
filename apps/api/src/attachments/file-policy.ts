const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/csv',
]);
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_PARENT = 10;
export function sanitizeFilename(value: string) {
  const safeCharacters = [...value.normalize('NFKC')]
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === '/' || character === '\\' || code < 32 || code === 127 ? '_' : character;
    })
    .join('');
  const cleaned = safeCharacters.replace(/\s+/g, ' ').trim().slice(0, 255);
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Filename is invalid.');
  return cleaned;
}
export function validateFilePolicy(input: {
  filename: string;
  mediaType: string;
  sizeBytes: number;
  existingCount?: number;
}) {
  if (!allowedTypes.has(input.mediaType)) throw new Error('This file type is not supported.');
  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_ATTACHMENT_BYTES
  )
    throw new Error('File must be between 1 byte and 25 MiB.');
  if ((input.existingCount ?? 0) >= MAX_ATTACHMENTS_PER_PARENT)
    throw new Error('This item already has the maximum number of attachments.');
  return { ...input, filename: sanitizeFilename(input.filename) };
}
