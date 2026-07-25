import { describe, expect, it } from 'vitest';
import { deadlineState, includeInWorkload, workloadScopes } from '../src/index.js';

describe('workload counts', () => {
  it('counts only active work and rolls Project into Category', () => {
    expect(includeInWorkload({ lifecycle: 'active' })).toBe(true);
    expect(includeInWorkload({ lifecycle: 'archived' })).toBe(false);
    expect(includeInWorkload({ lifecycle: 'deleting' })).toBe(false);
    expect(workloadScopes('project-a', 'category-a')).toEqual([
      { type: 'project', id: 'project-a' },
      { type: 'category', id: 'category-a' },
    ]);
    expect(workloadScopes()).toEqual([{ type: 'unassigned', id: 'unassigned' }]);
  });

  it('compares date-only deadlines without UTC conversion', () => {
    expect(deadlineState(undefined, '2026-07-24')).toBe('undated');
    expect(deadlineState('2026-07-23', '2026-07-24')).toBe('overdue');
    expect(deadlineState('2026-07-24', '2026-07-24')).toBe('today');
    expect(deadlineState('2026-07-31', '2026-07-24')).toBe('upcoming');
  });
});
