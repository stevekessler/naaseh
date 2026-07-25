import { describe, expect, it } from 'vitest';
import { projectEffectivelyAssignable } from '@naaseh/domain';

describe('Project assignment authorization', () => {
  it('rejects archived Projects and children of archived Categories', () => {
    expect(projectEffectivelyAssignable({ lifecycle: 'active' }, { lifecycle: 'active' })).toBe(
      true,
    );
    expect(projectEffectivelyAssignable({ lifecycle: 'archived' }, { lifecycle: 'active' })).toBe(
      false,
    );
    expect(projectEffectivelyAssignable({ lifecycle: 'active' }, { lifecycle: 'archived' })).toBe(
      false,
    );
  });
});
