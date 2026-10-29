import { describe, expect, it, vi } from 'vitest';
import {
  clearFinanceSearchIndexes,
  FinanceTransactionIndex,
  registerFinanceSearchIndex,
} from '../../src/search/finance-index.js';

const documents = [
  {
    id: 'visible-1',
    accountId: 'account-a',
    description: 'Fixture Cafe',
    payee: 'Cafe',
    memo: 'Breakfast meeting',
    merchantName: 'Fixture Coffee',
  },
  {
    id: 'visible-2',
    accountId: 'account-b',
    description: 'Hardware store',
    payee: 'Tools',
    memo: 'Fixture repair supplies',
    merchantName: 'Builders',
  },
];

describe('memory-only Finance transaction index', () => {
  it('searches descriptions, payees, memos, and merchant names within the selected account', async () => {
    const index = new FinanceTransactionIndex();
    await index.replaceProgressively(documents, {
      batchSize: 1,
      yieldToMain: async () => undefined,
    });
    expect(index.search('fixture', { accountId: 'account-a' })).toEqual(['visible-1']);
    expect(index.search('fixture')).toEqual(expect.arrayContaining(['visible-1', 'visible-2']));
    expect(index.search('builders')).toEqual(['visible-2']);
  });

  it('reports progressive indexing and removes revoked documents from memory', async () => {
    const index = new FinanceTransactionIndex();
    const onProgress = vi.fn();
    await index.replaceProgressively(documents, {
      batchSize: 1,
      onProgress,
      yieldToMain: async () => undefined,
    });
    expect(onProgress).toHaveBeenLastCalledWith({ indexed: 2, total: 2, complete: true });
    index.removeAccount('account-a');
    expect(index.search('fixture')).toEqual(['visible-2']);
    index.clear();
    expect(index.search('fixture')).toEqual([]);
  });

  it('cancels stale progressive builds so revoked data cannot reappear', async () => {
    const index = new FinanceTransactionIndex();
    let release: (() => void) | undefined;
    const pending = index.replaceProgressively(documents, {
      batchSize: 1,
      yieldToMain: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    await Promise.resolve();
    index.clear();
    release?.();
    await pending;
    expect(index.search('fixture')).toEqual([]);
  });

  it('clears every registered in-memory index during audience revocation', async () => {
    const index = new FinanceTransactionIndex();
    const unregister = registerFinanceSearchIndex(index);
    await index.replaceProgressively(documents, { yieldToMain: async () => undefined });
    clearFinanceSearchIndexes();
    expect(index.search('fixture')).toEqual([]);
    unregister();
  });
});

it('does not repopulate a revoked account from an in-flight indexing batch', async () => {
  const index = new FinanceTransactionIndex();
  let release: (() => void) | undefined;
  const pending = index.replaceProgressively(
    [
      { ...documents[0]!, id: 'first' },
      { ...documents[0]!, id: 'later' },
    ],
    {
      batchSize: 1,
      yieldToMain: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    },
  );
  await Promise.resolve();
  index.removeAccount('account-a');
  release?.();
  await pending;
  expect(index.search('fixture')).toEqual([]);
});
