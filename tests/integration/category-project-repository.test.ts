import { describe, expect, it } from 'vitest';
import { buildProjectNameReservation } from '../../apps/api/src/projects/project-repository.js';

describe('Project repository reservations', () => {
  it('scopes conditional reservations to the Category and changes them on move', () => {
    expect(buildProjectNameReservation('category-a', 'API')).toEqual({
      PK: 'PROJECTNAME#category-a#api',
      SK: 'PROJECT',
    });
    expect(buildProjectNameReservation('category-b', 'API').PK).not.toBe(
      buildProjectNameReservation('category-a', 'API').PK,
    );
  });
});
