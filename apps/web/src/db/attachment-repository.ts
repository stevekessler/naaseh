import type { Attachment } from '@naaseh/domain';
import { db } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';
export async function cacheAttachmentMetadata(item: Attachment) {
  await db.secureAttachments.put({
    id: item.id,
    taskId: item.parentId,
    updatedAt: item.updatedAt,
    value: await encryptLocalValue('attachment', item.id, item),
  });
}
export async function listAttachmentMetadata(parentId: string): Promise<Attachment[]> {
  const rows = await db.secureAttachments.where('taskId').equals(parentId).toArray();
  return Promise.all(
    rows.map((row) => decryptLocalValue<Attachment>('attachment', row.id, row.value)),
  );
}
export async function purgeAttachmentCapabilities() {
  await db.settings.where('key').startsWith('attachment-capability:').delete();
}
export async function removeAttachmentMetadata(id: string) {
  await db.secureAttachments.delete(id);
}
