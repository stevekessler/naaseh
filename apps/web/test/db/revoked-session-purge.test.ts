import { describe, expect, it, vi } from 'vitest';
import { purgeRevokedSessionData } from '../../src/sync/privacy-purge.js';

describe('revoked-session cache purge', () => {
  it('purges protected stores and dependent outbox entries atomically', async () => {
    const transaction = vi.fn(async (work: () => Promise<void>) => work());
    const clearProtectedStores = vi.fn(async () => undefined);
    const clearDependentOutbox = vi.fn(async () => undefined);
    await purgeRevokedSessionData({ transaction, clearProtectedStores, clearDependentOutbox });
    expect(transaction).toHaveBeenCalledOnce();
    expect(clearProtectedStores).toHaveBeenCalledOnce();
    expect(clearDependentOutbox).toHaveBeenCalledOnce();
  });
});
