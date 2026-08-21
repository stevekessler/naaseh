import { describe, expect, it } from 'vitest';
import { createTaskTimer, effectiveTaskTimer } from '@naaseh/domain';

describe('task timer passive cost and projection', () => {
  it('projects one million passive intervals with bounded arithmetic and no requests', () => {
    const timer = {
      ...createTaskTimer(
        'owner',
        'task',
        '2020-01-01T00:00:00.000Z',
        '01J00000000000000000000001',
        60,
      ),
      repeatEnabled: true,
    };
    const started = performance.now();
    const projected = effectiveTaskTimer(timer, '2021-11-25T10:40:30.000Z');
    expect(projected.intervalOrdinal).toBeGreaterThan(999_999);
    expect(performance.now() - started).toBeLessThan(50);
    expect(projected).not.toHaveProperty('scheduledRequest');
  });
});
