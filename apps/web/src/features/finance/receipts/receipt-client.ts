import { financeReceiptPageSchema, type FinanceReceiptView } from '@naaseh/contracts';
import { MAX_FINANCE_RECEIPT_BYTES, MAX_FINANCE_RECEIPT_RANGE_BYTES } from '@naaseh/domain';
import {
  deleteReceiptDraft,
  pinReceiptDraft,
  readReceiptDraft,
  receiptChecksum,
  receiptDraftIds,
} from '../../../db/finance-receipt-repository.js';
import { financeRequest, FinanceClientError } from '../finance-client.js';
import { currentFinanceAccess } from '../security/finance-access.js';

export type ReceiptView = FinanceReceiptView;

export async function requestReceiptPage(path: string, options?: RequestInit) {
  return financeReceiptPageSchema.parse(await financeRequest(path, options));
}

type UploadGrant = {
  receipt: ReceiptView;
  uploadUrl?: string;
  uploadSessionId?: string;
  requiredHeaders?: Record<string, string>;
};
const inProgress = new Map<string, Promise<ReceiptView | undefined>>();
const receiptPath = (id: string) => '/finance/receipts/' + encodeURIComponent(id);

export function uploadSavedReceipt(id: string, csrfToken: string, signal?: AbortSignal) {
  const access = currentFinanceAccess();
  const key = access.ownerId + ':' + id;
  const existing = inProgress.get(key);
  if (existing) return existing;
  const operation = access
    .read(async (visitSignal) => {
      const draft = await readReceiptDraft(id, visitSignal);
      if (!draft) return undefined;
      const endpoint = receiptPath(id) + '/complete';
      const complete = (body: unknown) =>
        financeRequest<ReceiptView>(endpoint, {
          method: 'POST',
          csrfToken,
          body: JSON.stringify(body),
          signal: visitSignal,
        });
      let receipt: ReceiptView;
      if (draft.uploaded) {
        try {
          receipt = await complete(draft.uploaded);
        } catch (error) {
          if (
            error instanceof FinanceClientError &&
            error.problem.code === 'receipt_upload_expired'
          ) {
            await pinReceiptDraft(
              { upload: draft.upload, transactionId: draft.transactionId, bytes: draft.bytes },
              visitSignal,
            );
          }
          throw error;
        }
      } else {
        const grant = await financeRequest<UploadGrant>(
          '/finance/transactions/' + encodeURIComponent(draft.transactionId) + '/receipts/uploads',
          { method: 'POST', csrfToken, body: JSON.stringify(draft.upload), signal: visitSignal },
        );
        receipt = grant.receipt;
        if (receipt.status === 'pending_upload') {
          if (!grant.uploadSessionId || !grant.uploadUrl || !grant.requiredHeaders)
            throw new Error('The receipt upload session is incomplete.');
          const uploaded = await fetch(grant.uploadUrl, {
            method: 'PUT',
            headers: grant.requiredHeaders,
            body: draft.bytes,
            credentials: 'omit',
            redirect: 'error',
            signal: visitSignal,
          });
          if (uploaded.status === 412) {
            receipt = await complete({ uploadSessionId: grant.uploadSessionId, recover: true });
          } else {
            const objectVersionId = uploaded.headers.get('x-amz-version-id');
            const etag = uploaded.headers.get('etag');
            if (!uploaded.ok || !objectVersionId || !etag)
              throw new Error(
                'The upload could not be confirmed. The encrypted file is saved for retry.',
              );
            const pin = { uploadSessionId: grant.uploadSessionId, objectVersionId, etag };
            await pinReceiptDraft({ ...draft, uploaded: pin }, visitSignal);
            receipt = await complete(pin);
          }
        }
      }
      if (!['pending_upload', 'expired', 'cancelled'].includes(receipt.status))
        await deleteReceiptDraft(id, visitSignal);
      return receipt;
    }, signal)
    .finally(() => inProgress.delete(key));
  inProgress.set(key, operation);
  return operation;
}

export async function resumeReceiptUploads(csrfToken: string, signal: AbortSignal) {
  if (!navigator.onLine) return;
  for (const id of await receiptDraftIds()) {
    if (signal.aborted) return;
    try {
      await uploadSavedReceipt(id, csrfToken, signal);
    } catch {
      // A failed upload keeps its encrypted draft and can be retried from the transaction.
    }
  }
}

export async function cancelReceipt(id: string, csrfToken: string) {
  try {
    await financeRequest(receiptPath(id) + '/pending', { method: 'DELETE', csrfToken });
  } catch (error) {
    if (!(error instanceof FinanceClientError) || error.problem.status !== 404) throw error;
  }
  await deleteReceiptDraft(id);
}

export async function downloadReceipt(receipt: ReceiptView, signal?: AbortSignal) {
  const access = currentFinanceAccess();
  if (
    receipt.status !== 'available' ||
    !receipt.etag ||
    receipt.sizeBytes < 1 ||
    receipt.sizeBytes > MAX_FINANCE_RECEIPT_BYTES
  )
    throw new Error('The receipt is still being checked.');
  const etag = receipt.etag;
  return access.read(async (visitSignal) => {
    const bytes = new Uint8Array(receipt.sizeBytes);
    for (let start = 0; start < bytes.length; start += MAX_FINANCE_RECEIPT_RANGE_BYTES) {
      const end = Math.min(start + MAX_FINANCE_RECEIPT_RANGE_BYTES, bytes.length) - 1;
      const response = await fetch('/api/v1' + receiptPath(receipt.id) + '/content', {
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: visitSignal,
        headers: {
          ...access.requestHeaders(),
          'x-finance-owner': access.ownerId,
          range: `bytes=${start}-${end}`,
          'if-match': etag,
        },
      });
      if (response.status === 401 || response.status === 403) await access.markStale();
      if (
        response.status !== 206 ||
        response.headers.get('etag') !== etag ||
        response.headers.get('content-range') !== `bytes ${start}-${end}/${bytes.length}` ||
        response.headers.get('content-length') !== String(end - start + 1) ||
        response.headers.get('content-type') !== receipt.mediaType
      )
        throw new Error('The receipt changed or is no longer accessible.');
      const chunk = await response.arrayBuffer();
      if (chunk.byteLength !== end - start + 1) throw new Error('Receipt download was incomplete.');
      bytes.set(new Uint8Array(chunk), start);
    }
    if ((await receiptChecksum(bytes)) !== receipt.checksumSha256)
      throw new Error('Receipt checksum verification failed.');
    visitSignal.throwIfAborted();
    return new Blob([bytes], { type: receipt.mediaType });
  }, signal);
}
