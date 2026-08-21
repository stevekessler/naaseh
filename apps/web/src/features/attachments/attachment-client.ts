import {
  cacheAttachmentMetadata,
  removeAttachmentMetadata,
} from '../../db/attachment-repository.js';
import type { Attachment } from '@naaseh/domain';
function base64(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export async function checksumFile(file: File) {
  return base64(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
}
const mediaTypeByExtension = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain'],
  ['.csv', 'text/csv'],
]);
export function attachmentMediaType(file: Pick<File, 'name' | 'type'>) {
  const reported = file.type.trim().toLowerCase();
  if (reported && reported !== 'application/octet-stream') return reported;
  const lowerFilename = file.name.toLowerCase();
  for (const [extension, mediaType] of mediaTypeByExtension) {
    if (lowerFilename.endsWith(extension)) return mediaType;
  }
  return reported;
}
export const uploadProgressPercent = (loaded: number, total: number) =>
  total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<{ versionId: string; etag: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(uploadProgressPercent(event.loaded, event.total));
    };
    request.onerror = () => reject(new Error('The encrypted upload was interrupted.'));
    request.onabort = () => reject(new Error('The encrypted upload was cancelled.'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('The encrypted upload did not complete.'));
        return;
      }
      resolve({
        versionId: request.getResponseHeader('x-amz-version-id') ?? 'unknown',
        etag: request.getResponseHeader('etag') ?? 'unknown',
      });
    };
    request.send(file);
  });
}
export async function uploadAttachment(
  file: File,
  parentType: 'task' | 'listItem',
  parentId: string,
  csrfToken: string,
  onProgress: (value: number) => void = () => {},
) {
  if (!navigator.onLine) throw new Error('Connect to the internet to upload this file.');
  const checksumSha256 = await checksumFile(file);
  const mediaType = attachmentMediaType(file);
  const initiate = await fetch('/api/v1/attachments/uploads', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-client-mutation-id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      parentType,
      parentId,
      originalFilename: file.name,
      mediaType,
      sizeBytes: file.size,
      checksumSha256,
    }),
  });
  if (!initiate.ok) throw new Error('The attachment upload could not be started.');
  const grant = (await initiate.json()) as {
    attachment: Attachment;
    uploadSessionId: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  const uploaded = await putWithProgress(grant.uploadUrl, grant.requiredHeaders, file, onProgress);
  onProgress(100);
  const completed = await fetch(`/api/v1/attachments/${grant.attachment.id}/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-upload-session-id': grant.uploadSessionId,
      'x-client-mutation-id': crypto.randomUUID(),
    },
    body: JSON.stringify({ objectVersionId: uploaded.versionId, etag: uploaded.etag }),
  });
  if (!completed.ok) throw new Error('The uploaded file could not be verified.');
  const attachment = (await completed.json()) as Attachment;
  await cacheAttachmentMetadata(attachment);
  return attachment;
}
export async function downloadAttachment(id: string) {
  const response = await fetch(`/api/v1/attachments/${id}/download`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The attachment is unavailable.');
  const grant = (await response.json()) as { url: string };
  location.assign(grant.url);
}
export async function refreshAttachment(id: string) {
  const response = await fetch(`/api/v1/attachments/${id}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The attachment status is unavailable.');
  const item = (await response.json()) as Attachment;
  await cacheAttachmentMetadata(item);
  return item;
}
export async function retryAttachment(id: string, csrfToken: string) {
  const response = await fetch(`/api/v1/attachments/${id}/retry`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken, 'x-client-mutation-id': crypto.randomUUID() },
  });
  if (!response.ok) throw new Error('The attachment scan could not be retried.');
  const item = (await response.json()) as Attachment;
  await cacheAttachmentMetadata(item);
  return item;
}
export async function removeAttachment(id: string, csrfToken: string) {
  const response = await fetch(`/api/v1/attachments/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken, 'x-client-mutation-id': crypto.randomUUID() },
  });
  if (!response.ok) throw new Error('The attachment could not be removed.');
  await removeAttachmentMetadata(id);
}
