import { expect, it } from 'vitest';
import { categoryForeground } from '../../src/styles/category-color.js';
it('chooses contrasting foreground and a safe fallback', () => {
  expect(categoryForeground('#000000').foreground).toBe('#ffffff');
  expect(categoryForeground('invalid').background).toBe('#fff2a8');
});
