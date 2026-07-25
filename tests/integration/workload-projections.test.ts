import { describe, expect, it } from 'vitest';
import { workloadProjectionChanges } from '../../apps/api/src/reporting/workload-projection-repository.js';

describe('workload projection adjustments', () => {
  it('increments, decrements, and transfers scopes exactly once', () => {
    const created = workloadProjectionChanges(undefined, {
      id: 'task-a',
      workType: 'task',
      audience: 'OWNER#owner',
      lifecycle: 'active',
      projectId: 'project-a',
      categoryId: 'category-a',
    });
    expect(created.reduce((sum, change) => sum + change.delta, 0)).toBe(2);
    const moved = workloadProjectionChanges(
      {
        id: 'task-a',
        workType: 'task',
        audience: 'OWNER#owner',
        lifecycle: 'active',
        projectId: 'project-a',
        categoryId: 'category-a',
      },
      {
        id: 'task-a',
        workType: 'task',
        audience: 'OWNER#owner',
        lifecycle: 'active',
      },
    );
    expect(moved.reduce((sum, change) => sum + change.delta, 0)).toBe(-1);
  });
});
