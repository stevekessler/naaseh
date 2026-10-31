import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeviceKey, decryptText, type Ciphertext } from '../../src/crypto/vault.js';
import { queueFinanceReceiptBytes } from '../../src/db/finance-repository.js';
import type { EncryptedFinanceRecord, StoredMutation } from '../../src/db/database.js';

const state = vi.hoisted(() => ({
  bytes: new Map<string, Record<string, unknown>>(),
  records: new Map<string, unknown>(),
  mutations: new Map<string, unknown>(),
  key: undefined as CryptoKey | undefined,
  quota: false,
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    cryptoKeys: { get: async () => (state.key ? { key: state.key } : undefined) },
    secureFinancePendingBytes: {
      put: async (record: Record<string, unknown>) => {
        state.bytes.set(String(record.id), record);
      },
    },
    secureFinanceRecords: {
      put: async (record: EncryptedFinanceRecord) => {
        state.records.set(record.id, record);
      },
    },
    outbox: {
      add: async (mutation: StoredMutation) => {
        if (state.quota) {
          const error = new Error('Synthetic quota failure');
          error.name = 'QuotaExceededError';
          throw error;
        }
        state.mutations.set(mutation.id, mutation);
      },
    },
    transaction: async (_mode: string, ...args: unknown[]) => {
      const snapshot = [
        new Map(state.bytes),
        new Map(state.records),
        new Map(state.mutations),
      ] as const;
      try {
        await (args.at(-1) as () => Promise<void>)();
      } catch (error) {
        for (const map of [state.bytes, state.records, state.mutations]) map.clear();
        for (const [id, value] of snapshot[0]) state.bytes.set(id, value);
        for (const [id, value] of snapshot[1]) state.records.set(id, value);
        for (const [id, value] of snapshot[2]) state.mutations.set(id, value);
        throw error;
      }
    },
  },
}));

function input(bytes = new Uint8Array([65, 66, 67])) {
  const record: EncryptedFinanceRecord = {
    id: 'receipt-1',
    entityType: 'financeReceipt',
    scopeKey: 'OWNER#u1',
    version: 1,
    updatedAt: '2026-10-31T18:00:00Z',
    value: { iv: 'synthetic', ciphertext: 'encrypted-metadata' },
  };
  const mutation: StoredMutation = {
    id: 'mutation-1',
    entityType: 'financeReceipt',
    entityId: record.id,
    operation: 'create',
    baseVersion: 0,
    createdAt: record.updatedAt,
    attempts: 0,
    payload: { iv: 'synthetic', ciphertext: 'encrypted-payload' },
  };
  return { ownerId: 'u1', transactionId: 'transaction-1', bytes, record, mutation };
}
beforeEach(async () => {
  state.bytes.clear();
  state.records.clear();
  state.mutations.clear();
  state.quota = false;
  state.key = await createDeviceKey();
});

describe('durable protected receipt selection', () => {
  it('encrypts and atomically queues a maximum-size receipt without exposing its original bytes', async () => {
    const bytes = new Uint8Array(10_000_000).fill(65);
    bytes[bytes.length - 1] = 90;
    await queueFinanceReceiptBytes(input(bytes));
    const record = state.bytes.get('receipt-1')!;
    const plaintext = await decryptText(
      record.value as Ciphertext,
      state.key!,
      'finance:receiptBytes:receipt-1:v1',
    );
    const decoded = atob(plaintext);
    expect(decoded.length).toBe(10_000_000);
    expect(decoded.at(-1)).toBe('Z');
    expect(record).not.toHaveProperty('bytes');
    expect(state.records.has('receipt-1')).toBe(true);
    expect(state.mutations.has('mutation-1')).toBe(true);
    await expect(queueFinanceReceiptBytes(input(new Uint8Array(10_000_001)))).rejects.toThrow(
      /invalid/i,
    );
  });

  it('rolls back metadata, bytes and mutation on quota failure while preserving the transaction and key', async () => {
    const originalKey = state.key;
    state.records.set('transaction-1', { pending: true });
    state.quota = true;
    await expect(queueFinanceReceiptBytes(input())).rejects.toThrow(/durably queued/i);
    expect(state.bytes.size).toBe(0);
    expect(state.mutations.size).toBe(0);
    expect([...state.records]).toEqual([['transaction-1', { pending: true }]]);
    expect(state.key).toBe(originalKey);
  });
});
