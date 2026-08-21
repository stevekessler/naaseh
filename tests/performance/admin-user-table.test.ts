import { describe, expect, it } from 'vitest';
import { createUserAdminService } from '../../apps/api/src/admin/user-admin-service.js';

describe('bounded administrator user table', () => {
  it('returns at most 100 stable rows from a 10,000-user source', async () => {
    const users = Array.from({ length: 10_000 }, (_, index) => ({
      id: `user-${index}`,
      username: `person-${String(index).padStart(5, '0')}`,
      displayName: `Person ${index}`,
      role: 'user' as const,
      active: true,
      sessionEpoch: 0,
      version: 1,
      tfaStatus: 'disabled' as const,
    }));
    const service = createUserAdminService({
      list: async () => users,
      get: async () => undefined,
      setStatus: async () => {
        throw new Error('unused');
      },
    });
    const started = performance.now();
    const page = await service.pageUsers({ limit: 100 });
    expect(page.items).toHaveLength(100);
    expect(page.nextCursor).toBeTruthy();
    expect(performance.now() - started).toBeLessThan(200);
  });
});
