import { expect, it } from 'vitest';
import { filterTasks } from '../../apps/web/src/search/task-search.js';
import { createTask } from '@naaseh/domain';

it('searches 50k tasks in under one second p95', () => {
  const tasks = Array.from({ length: 50_000 }, (_, index) =>
    createTask({ label: `Task ${index}`, memo: index === 49_999 ? 'needle' : '' }, 'u'),
  );
  const timings = Array.from({ length: 20 }, () => {
    const start = performance.now();
    expect(
      filterTasks(tasks, {
        query: 'needle',
        from: '',
        to: '',
        assigneeId: '',
        categoryId: '',
      }),
    ).toHaveLength(1);
    return performance.now() - start;
  }).sort((left, right) => left - right);
  const p50 = timings[Math.floor(timings.length * 0.5)]!;
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
  console.info(JSON.stringify({ metric: 'local-search-50k', p50Ms: p50, p95Ms: p95 }));
  expect(p95).toBeLessThan(1_000);
});
