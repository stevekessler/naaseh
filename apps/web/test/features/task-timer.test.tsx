import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createTaskTimer } from '@naaseh/domain';
import { TaskTimer } from '../../src/features/timers/TaskTimer.js';
import { isActiveTaskTimer, timerStatusText } from '../../src/features/timers/useTaskTimer.js';

const timer = createTaskTimer(
  'owner',
  '01J00000000000000000000001',
  '2026-08-14T12:00:00.000Z',
  '01J00000000000000000000002',
);

describe('task timer controls', () => {
  it('renders the ten-minute default and accessible controls', () => {
    const html = renderToStaticMarkup(
      <TaskTimer
        timer={timer}
        now="2026-08-14T12:00:00.000Z"
        taskLabel="Write plan"
        command={vi.fn()}
        movable
        onDismiss={vi.fn()}
      />,
    );
    expect(html).toContain('10:00');
    expect(html).toContain('Pause timer');
    expect(html).toContain('Stop timer');
    expect(html).toContain('Move timer');
    expect(html).toContain('Close timer');
    expect(html).toContain('Repeat');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');
    expect(html).toContain('aria-live="polite"');
  });

  it('uses status text for pending, conflict, and unavailable feedback', () => {
    expect(timerStatusText('pending')).toMatch(/pending/iu);
    expect(timerStatusText('conflict')).toMatch(/conflict/iu);
    expect(timerStatusText('unavailable')).toMatch(/unavailable/iu);
  });

  it('does not treat stopped or finished records from previous use as active timers', () => {
    expect(isActiveTaskTimer(timer)).toBe(true);
    expect(
      isActiveTaskTimer({
        ...timer,
        status: 'paused',
        anchorAt: null,
        endsAt: null,
        pausedRemainingSeconds: 300,
      }),
    ).toBe(true);
    expect(isActiveTaskTimer({ ...timer, status: 'finished', anchorAt: null, endsAt: null })).toBe(
      false,
    );
    expect(isActiveTaskTimer({ ...timer, status: 'stopped', anchorAt: null, endsAt: null })).toBe(
      false,
    );
    expect(isActiveTaskTimer(undefined)).toBe(false);
  });
});
