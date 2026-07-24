import { describe, expect, it, vi } from 'vitest';
import { canReadTaskAs, createTask, setTaskLocked } from '@naaseh/domain';
import { recordTaskAdminRead } from '../../apps/api/src/tasks/telemetry.js';
describe('task lock administrator boundary', () => {
  it('allows audited admin read but never admin mutation or protected content logging', () => {
    const locked = setTaskLocked(createTask({ label: 'Secret' }, 'owner'), true, 'owner');
    const admin = { id: 'admin', role: 'admin' as const, active: true };
    expect(canReadTaskAs(locked, admin).allowed).toBe(true);
    expect(() => setTaskLocked(locked, false, 'admin')).toThrow();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    recordTaskAdminRead('correlation', 'admin', locked.id);
    expect(info.mock.calls.flat().join(' ')).not.toContain('Secret');
    info.mockRestore();
  });
});
