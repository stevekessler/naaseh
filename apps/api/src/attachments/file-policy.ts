import { MAX_FINANCE_RECEIPT_BYTES, financeReceiptMediaTypes } from '@naaseh/domain';
import { SafeApiError } from '../shared/http.js';

const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
]);
const mediaTypeByExtension = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain'],
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
]);
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_PARENT = 10;
export function canonicalAttachmentMediaType(filename: string, mediaType: string) {
  const normalized = mediaType.trim().toLowerCase();
  if (allowedTypes.has(normalized)) return normalized;
  // iOS Files and other OS document providers sometimes expose downloaded files
  // with a generic MIME type even though the selected filename has a supported
  // extension. The bytes remain untrusted and still go through malware scanning.
  if (!normalized || normalized === 'application/octet-stream') {
    const lowerFilename = filename.toLowerCase();
    for (const [extension, inferred] of mediaTypeByExtension) {
      if (lowerFilename.endsWith(extension)) return inferred;
    }
  }
  throw Object.assign(new Error('This file type is not supported.'), {
    statusCode: 400,
    code: 'invalid_attachment',
  });
}
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
  const mediaType = canonicalAttachmentMediaType(input.filename, input.mediaType);
  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_ATTACHMENT_BYTES
  )
    throw Object.assign(new Error('File must be between 1 byte and 25 MiB.'), {
      statusCode: 400,
      code: 'invalid_attachment',
    });
  if ((input.existingCount ?? 0) >= MAX_ATTACHMENTS_PER_PARENT)
    throw Object.assign(new Error('This item already has the maximum number of attachments.'), {
      statusCode: 400,
      code: 'invalid_attachment',
    });
  return { ...input, filename: sanitizeFilename(input.filename), mediaType };
}

export function validateReceiptFilePolicy(input: {
  filename: string;
  mediaType: string;
  sizeBytes: number;
}) {
  let filename: string;
  try {
    filename = sanitizeFilename(input.filename);
  } catch {
    throw new SafeApiError(
      400,
      'invalid_receipt',
      'Choose a valid receipt filename.',
      'validation',
    );
  }
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const mediaType =
    Object.hasOwn(financeReceiptMediaTypes, extension) && filename.includes('.')
      ? financeReceiptMediaTypes[extension as keyof typeof financeReceiptMediaTypes]
      : undefined;
  const claimed = input.mediaType.trim().toLowerCase();
  if (!mediaType || (claimed && claimed !== 'application/octet-stream' && claimed !== mediaType))
    throw new SafeApiError(
      400,
      'invalid_receipt',
      'Choose a supported receipt with a matching file extension and type.',
      'validation',
    );
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_FINANCE_RECEIPT_BYTES
  )
    throw new SafeApiError(
      400,
      'invalid_receipt',
      'Choose a receipt between 1 byte and 10 MB.',
      'validation',
    );
  return { filename, sizeBytes: input.sizeBytes, mediaType };
}
