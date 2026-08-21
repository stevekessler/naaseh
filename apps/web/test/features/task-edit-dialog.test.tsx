import { describe, expect, it } from 'vitest';
import { fiveMinuteTimeOptions } from '../../src/features/tasks/due-value.js';

describe('task edit controls', () => {
  it('provides a dense five-minute time list', () => {
    expect(fiveMinuteTimeOptions()).toHaveLength(288);
    expect(fiveMinuteTimeOptions()).toContain('10:05');
  });
});
