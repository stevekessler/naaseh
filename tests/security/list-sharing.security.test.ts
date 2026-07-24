import { describe, expect, it, vi } from 'vitest';
import { createList } from '@naaseh/domain';
import { authorizeList } from '../../apps/api/src/lists/list-authorization.js';
import { recordListAdminRead } from '../../apps/api/src/lists/telemetry.js';
describe('list sharing security', () => {
  it('allows admin reads, denies admin mutation, and emits content-free audit', () => {
    const list = { ...createList({ name: 'Protected name' }, 'owner'), locked: true };
    const admin = { id: 'admin', role: 'admin' as const, active: true, groupIds: [] };
    expect(authorizeList(list, admin).allowed).toBe(true);
    expect(authorizeList(list, admin, 'edit').allowed).toBe(false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordListAdminRead('correlation', 'admin', list.id);
    expect(info.mock.calls.flat().join(' ')).not.toContain('Protected name');
    info.mockRestore();
  });
});
