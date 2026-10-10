import { describe, expect, it } from 'vitest';
import { parseAppRoute, routePath } from '../../src/app/router.js';

describe('active work route consolidation', () => {
  it('opens legacy Projects links in the Personal Stack and emits one canonical URL', () => {
    expect(parseAppRoute('/projects')).toEqual({ section: 'stack' });
    expect(routePath({ section: 'projects' })).toBe('/stack');
    expect(routePath({ section: 'stack' })).toBe('/stack');
  });
});
