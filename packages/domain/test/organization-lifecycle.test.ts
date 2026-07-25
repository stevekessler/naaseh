import { describe, expect, it } from 'vitest';
import {
  archiveCategory,
  archiveProject,
  createProject,
  projectEffectivelyAssignable,
  restoreCategory,
  restoreProject,
} from '../src/index.js';

const category = {
  id: '01J00000000000000000000010',
  name: 'PAAO',
  color: '#336699',
  archived: false,
  lifecycle: 'active' as const,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  version: 1,
};

describe('organization lifecycle', () => {
  it('archives/restores independently, preserves child state, and remains editable by version', () => {
    const project = createProject(
      { categoryId: category.id, name: 'API' },
      new Date('2026-07-01T00:00:00.000Z'),
    );
    const archivedCategory = archiveCategory(
      category,
      'admin',
      new Date('2026-07-02T00:00:00.000Z'),
    );
    expect(projectEffectivelyAssignable(project, archivedCategory)).toBe(false);
    expect(project.lifecycle).toBe('active');
    expect(restoreCategory(archivedCategory).lifecycle).toBe('active');
    const archivedProject = archiveProject(project, 'admin');
    expect(projectEffectivelyAssignable(archivedProject, category)).toBe(false);
    expect(restoreProject(archivedProject).lifecycle).toBe('active');
  });
});
