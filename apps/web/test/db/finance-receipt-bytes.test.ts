import { beforeEach, expect, it, vi } from 'vitest';
import { createDeviceKey } from '../../src/crypto/vault.js';
import {
  queueReceiptFile,
  readReceiptDraft,
  receiptDraftIds,
  pinReceiptDraft,
  deleteReceiptDraft,
} from '../../src/db/finance-receipt-repository.js';
import type { EncryptedFinancePendingBytes } from '../../src/db/database.js';

const state = vi.hoisted(() => ({
  rows: new Map<string, EncryptedFinancePendingBytes>(),
  key: undefined as CryptoKey | undefined,
  ownerId: 'one',
  quota: false,
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  currentFinanceAccess: () => ({
    ownerId: state.ownerId,
    read: async (fn: (signal: AbortSignal) => Promise<unknown>) => fn(new AbortController().signal),
  }),
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  financeDeviceKey: () => state.key,
  commitFinanceWrite: async (_tables: unknown, write: () => Promise<void>) => write(),
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    secureFinancePendingBytes: {
      put: async (row: EncryptedFinancePendingBytes) => {
        if (state.quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        state.rows.set(row.id, row);
      },
      get: async (id: string) => state.rows.get(id),
      delete: async (id: string) => state.rows.delete(id),
      where: () => ({
        equals: (owner: string) => ({
          toArray: async () => [...state.rows.values()].filter(({ ownerId }) => ownerId === owner),
        }),
      }),
    },
  },
}));
beforeEach(async () => {
  state.rows.clear();
  state.key = await createDeviceKey();
  state.ownerId = 'one';
  state.quota = false;
});
const file = () =>
  new File(['synthetic receipt'], 'Private receipt.pdf', { type: 'application/pdf' });

it('encrypts the original and its filename, restores the exact draft and pins returned upload evidence', async () => {
  const id = await queueReceiptFile('transaction', file());
  expect(JSON.stringify(state.rows.get(id))).not.toMatch(/synthetic receipt|Private receipt/u);
  const draft = (await readReceiptDraft(id))!;
  expect(new TextDecoder().decode(draft.bytes)).toBe('synthetic receipt');
  expect(draft.upload.filename).toBe('Private receipt.pdf');
  const uploaded = { uploadSessionId: 'session', objectVersionId: 'version', etag: '"etag"' };
  await pinReceiptDraft({ ...draft, uploaded }, new AbortController().signal);
  expect((await readReceiptDraft(id))?.uploaded).toEqual(uploaded);
  state.ownerId = 'another';
  expect(await receiptDraftIds()).toEqual([]);
  expect(await readReceiptDraft(id)).toBeUndefined();
  await deleteReceiptDraft(id);
  expect(state.rows.has(id)).toBe(true);
});

it('reports quota failure without losing an earlier saved receipt', async () => {
  const existing = await queueReceiptFile('transaction', file());
  state.quota = true;
  await expect(queueReceiptFile('transaction', file())).rejects.toThrow(/Free storage/u);
  expect(await receiptDraftIds('transaction')).toEqual([existing]);
});
