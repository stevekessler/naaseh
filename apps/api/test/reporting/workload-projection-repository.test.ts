import { describe, expect, it } from 'vitest';
import {
  workloadProjectionChanges,
  workloadProjectionWrites,
  type ProjectedWork,
} from '../../src/reporting/workload-projection-repository.js';

const projected = (urgency: ProjectedWork['urgency']): ProjectedWork => ({
  id: 'task-1',
  workType: 'task',
  audience: 'OWNER#owner-1',
  projectId: 'project-1',
  categoryId: 'category-1',
  urgency,
});

const transactionKey = (item: ReturnType<typeof workloadProjectionWrites>[number]) => {
  if ('Update' in item && item.Update) return item.Update.Key;
  if ('Put' in item && item.Put)
    return { PK: item.Put.Item?.PK as string, SK: item.Put.Item?.SK as string };
  if ('Delete' in item && item.Delete) return item.Delete.Key;
  return undefined;
};

describe('workload projection transaction writes', () => {
  it('coalesces priority changes so a transaction never targets one item twice', () => {
    const changes = workloadProjectionChanges(projected('medium'), projected('critical'));
    const writes = workloadProjectionWrites(changes);
    const identities = writes.map(transactionKey).map((key) => `${key?.PK}\0${key?.SK}`);

    expect(new Set(identities).size).toBe(identities.length);
    expect(writes).toHaveLength(4);
    expect(writes.every((write) => 'Update' in write)).toBe(true);
  });
});
