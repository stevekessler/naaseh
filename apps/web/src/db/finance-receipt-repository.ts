import { MAX_FINANCE_RECEIPT_BYTES, createUlid } from '@naaseh/domain';
import { financeReceiptUploadSchema } from '@naaseh/contracts';
import { decryptText, encryptText } from '../crypto/vault.js';
import { currentFinanceAccess } from '../features/finance/security/finance-access.js';
import { db } from './database.js';
import { commitFinanceWrite, financeDeviceKey } from './finance-repository.js';

type DraftMetadata = ReturnType<typeof financeReceiptUploadSchema.parse>;
export interface ReceiptDraft {
  transactionId: string;
  upload: DraftMetadata;
  bytes: Uint8Array<ArrayBuffer>;
  uploaded?: { uploadSessionId: string; objectVersionId: string; etag: string };
}
const table = db.secureFinancePendingBytes;
const draftIdentity = (ownerId: string, transactionId: string, id: string) =>
  JSON.stringify(['financeReceiptDraft', ownerId, transactionId, id, 1]);
const queueKey = (id: string) => 'receipt-upload:' + id;

export async function receiptChecksum(bytes: Uint8Array<ArrayBuffer>) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))));
}

async function saveDraft(draft: ReceiptDraft, signal: AbortSignal, mustExist = false) {
  const { ownerId } = currentFinanceAccess();
  const id = draft.upload.clientReceiptId;
  const chunks: string[] = [];
  for (let offset = 0; offset < draft.bytes.length; offset += 32_768)
    chunks.push(String.fromCharCode(...draft.bytes.subarray(offset, offset + 32_768)));
  const value = await encryptText(
    JSON.stringify({
      upload: draft.upload,
      bytes: btoa(chunks.join('')),
      uploaded: draft.uploaded,
    }),
    await financeDeviceKey(),
    draftIdentity(ownerId, draft.transactionId, id),
  );
  try {
    await commitFinanceWrite(
      [table],
      async () => {
        if (mustExist) {
          const current = await table.get(id);
          if (current?.ownerId !== ownerId || current.mutationId !== queueKey(id)) return;
        }
        await table.put({
          id,
          ownerId,
          transactionId: draft.transactionId,
          mutationId: queueKey(id),
          version: 1,
          updatedAt: new Date().toISOString(),
          value,
        });
      },
      signal,
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('The receipt could not be saved on this device. Free storage and try again.');
  }
}

export async function queueReceiptFile(transactionId: string, file: File) {
  if (file.size < 1 || file.size > MAX_FINANCE_RECEIPT_BYTES)
    throw new Error('Choose a receipt between 1 byte and 10 MB.');
  return currentFinanceAccess().read(async (signal) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = financeReceiptUploadSchema.parse({
      clientReceiptId: createUlid(),
      filename: file.name,
      mediaType: file.type,
      sizeBytes: bytes.length,
      checksumSha256: await receiptChecksum(bytes),
    });
    const draft = { transactionId, upload, bytes };
    await saveDraft(draft, signal);
    return upload.clientReceiptId;
  });
}

export async function receiptDraftIds(transactionId?: string) {
  const access = currentFinanceAccess();
  return access.read(async () => {
    const rows = await table.where('ownerId').equals(access.ownerId).toArray();
    return rows
      .filter(
        (row) =>
          row.mutationId === queueKey(row.id) &&
          (!transactionId || row.transactionId === transactionId),
      )
      .map(({ id }) => id);
  });
}

export async function readReceiptDraft(id: string, outerSignal?: AbortSignal) {
  const access = currentFinanceAccess();
  return access.read(async () => {
    const row = await table.get(id);
    if (!row || row.ownerId !== access.ownerId || row.mutationId !== queueKey(id)) return undefined;
    const data = JSON.parse(
      await decryptText(
        row.value,
        await financeDeviceKey(),
        draftIdentity(access.ownerId, row.transactionId, row.id),
      ),
    ) as { upload: DraftMetadata; bytes: string; uploaded?: ReceiptDraft['uploaded'] };
    const upload = financeReceiptUploadSchema.parse(data.upload);
    const bytes = Uint8Array.from(atob(data.bytes), (character) => character.charCodeAt(0));
    if (
      upload.clientReceiptId !== id ||
      bytes.length !== upload.sizeBytes ||
      (await receiptChecksum(bytes)) !== upload.checksumSha256
    )
      throw new Error('The saved receipt cannot be verified.');
    return {
      transactionId: row.transactionId,
      upload,
      bytes,
      ...(data.uploaded ? { uploaded: data.uploaded } : {}),
    };
  }, outerSignal);
}

export const pinReceiptDraft = (draft: ReceiptDraft, signal: AbortSignal) =>
  saveDraft(draft, signal, true);

export async function deleteReceiptDraft(id: string, signal?: AbortSignal) {
  const { ownerId } = currentFinanceAccess();
  return commitFinanceWrite(
    [table],
    async () => {
      const row = await table.get(id);
      if (row?.ownerId === ownerId && row.mutationId === queueKey(id)) await table.delete(id);
    },
    signal,
  );
}
