import { describe, expect, it } from 'vitest';
import {
  canonicalProjectName,
  createProject,
  moveProject,
  projectNameReservation,
} from '../src/index.js';

const now = new Date('2026-07-24T12:00:00.000Z');
const categoryA = '01J00000000000000000000000';
const categoryB = '01J00000000000000000000001';

describe('Category → Project tree', () => {
  it('allows the same Project name under different Categories but not the same parent', () => {
    expect(projectNameReservation(categoryA, ' API ')).toBe(
      projectNameReservation(categoryA, 'api'),
    );
    expect(projectNameReservation(categoryA, 'API')).not.toBe(
      projectNameReservation(categoryB, 'API'),
    );
    expect(canonicalProjectName('ＡＰＩ')).toBe('api');
  });

  it('uses valid date-only end dates and optimistic versions', () => {
    const project = createProject(
      { categoryId: categoryA, name: 'Network', endDate: '2026-12-31' },
      now,
    );
    expect(project.endDate).toBe('2026-12-31');
    expect(() =>
      createProject({ categoryId: categoryA, name: 'Bad', endDate: '2026-02-30' }, now),
    ).toThrow();
    expect(moveProject(project, categoryB, now)).toMatchObject({
      categoryId: categoryB,
      version: 2,
    });
  });
});
