import { memoDocumentText, type MemoDocument } from '@naaseh/domain';

/**
 * Session-memory-only search for memos the user has explicitly unlocked.
 * Call `lock` on inactivity, sign-out, session revocation, or visibility loss.
 * No value held here is written to IndexedDB, the outbox, logs, or exports.
 */
export class HiddenMemoIndex {
  readonly #plain = new Map<string, string>();

  unlock(taskId: string, document: MemoDocument | string) {
    this.#plain.set(taskId, typeof document === 'string' ? document : memoDocumentText(document));
  }

  lock(taskId?: string) {
    if (taskId) this.#plain.delete(taskId);
    else this.#plain.clear();
  }

  search(query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return [...this.#plain]
      .filter(([, text]) => text.toLocaleLowerCase().includes(normalized))
      .map(([taskId]) => taskId);
  }
}

export { HiddenMemoIndex as UnlockedHiddenMemoIndex };
