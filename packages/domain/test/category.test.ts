import { describe, expect, it } from 'vitest';
import { archiveCategory, categorySchema } from '../src/category.js';
describe('category domain', () => {
  const categoryId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  it('validates color, name, and default assignee', () => {
    const category = categorySchema.parse({
      id: categoryId,
      name: 'Calls',
      color: '#36a83f',
      defaultAssigneeId: 'u',
    });
    expect(category.archived).toBe(false);
    expect(categorySchema.safeParse({ ...category, color: 'green' }).success).toBe(false);
  });
  it('archives without discarding existing identity', () => {
    expect(
      archiveCategory(categorySchema.parse({ id: categoryId, name: 'Calls', color: '#36a83f' })),
    ).toMatchObject({ id: categoryId, archived: true, version: 2 });
  });
});
