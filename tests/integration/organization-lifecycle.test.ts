import { describe, expect, it } from 'vitest';
import { archiveCategory, archiveProject, createProject, restoreCategory } from '@naaseh/domain';

describe('organization lifecycle transitions', () => {
  it('does not cascade parent archive state into a child and advances optimistic versions', () => {
    const category = {
      id: '01J00000000000000000000010',
      name: 'PAAO',
      color: '#336699',
      archived: false,
      lifecycle: 'active' as const,
      version: 1,
    };
    const project = createProject({ categoryId: category.id, name: 'API' });
    const parent = archiveCategory(category, 'admin');
    expect(parent.version).toBe(2);
    expect(project.lifecycle).toBe('active');
    expect(archiveProject(project, 'admin').version).toBe(2);
    expect(restoreCategory(parent).version).toBe(3);
  });
});
