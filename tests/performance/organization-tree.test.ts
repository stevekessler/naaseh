import { describe, expect, it } from 'vitest';
import { calculateWorkloadTree } from '../../apps/web/src/db/workload-selector.js';

describe('organization tree performance', () => {
  it('counts 50,000 work records across 1,000 Projects in under one second', () => {
    const projects = Array.from({ length: 1_000 }, (_, index) => ({
      id: `project-${index}`,
      categoryId: `category-${index % 100}`,
    }));
    const work = Array.from({ length: 50_000 }, (_, index) => ({
      kind: index % 2 ? ('task' as const) : ('list' as const),
      lifecycle: 'active' as const,
      projectId: projects[index % projects.length]!.id,
    }));
    const start = performance.now();
    const result = calculateWorkloadTree(projects, work);
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(result.projects.size).toBe(1_000);
  });
});
