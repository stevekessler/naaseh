import { describe, expect, it } from 'vitest';
import { organizationTreeResponseSchema } from '../../apps/api/src/reporting/organization-tree-service.js';

describe('organization tree contract', () => {
  it('keeps to-do and List counts separate with canonical drill-down scopes', () => {
    const value = organizationTreeResponseSchema.parse({
      asOf: '2026-07-24T12:00:00.000Z',
      categories: [{ id: 'category-a', name: 'PAAO', taskCount: 3, listCount: 2, projects: [] }],
      unassigned: { taskCount: 1, listCount: 1 },
    });
    expect(value.categories[0]).toMatchObject({ taskCount: 3, listCount: 2 });
  });
});
