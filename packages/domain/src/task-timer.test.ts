import { describe, expect, it } from 'vitest';
import {
  applyTaskTimerCommand,
  createTaskTimer,
  effectiveTaskTimer,
  taskTimerSchema,
} from './task-timer.js';

const ownerId = 'user-1';
const taskId = '01J00000000000000000000001';
const runId = '01J00000000000000000000002';
const at = '2026-08-14T12:00:00.000Z';

describe('TaskTimer', () => {
  it('defaults to ten minutes and validates minute duration bounds', () => {
    expect(createTaskTimer(ownerId, taskId, at, runId).durationSeconds).toBe(600);
    for (const durationSeconds of [59, 61, 86_401]) {
      expect(() =>
        taskTimerSchema.parse({
          ...createTaskTimer(ownerId, taskId, at, runId),
          durationSeconds,
        }),
      ).toThrow();
    }
  });

  it('projects a non-repeating run as finished without completing its task', () => {
    const timer = createTaskTimer(ownerId, taskId, at, runId);
    const projected = effectiveTaskTimer(timer, '2026-08-14T12:10:01.000Z');
    expect(projected.status).toBe('finished');
    expect(projected.taskId).toBe(taskId);
    expect(projected.feedback).toEqual({ runId, intervalOrdinal: 1 });
    expect(projected).not.toHaveProperty('completionEvent');
    expect(projected).not.toHaveProperty('taskStatus');
  });

  it('advances repeat intervals arithmetically across long suspension gaps', () => {
    const timer = { ...createTaskTimer(ownerId, taskId, at, runId), repeatEnabled: true };
    const projected = effectiveTaskTimer(timer, '2026-08-15T12:05:00.000Z');
    expect(projected.status).toBe('running');
    expect(projected.intervalOrdinal).toBe(145);
    expect(projected.remainingSeconds).toBe(300);
    expect(projected.feedback).toEqual({ runId, intervalOrdinal: 144 });
  });

  it('pauses, resumes, changes duration with a new run, and explicitly switches tasks', () => {
    const started = createTaskTimer(ownerId, taskId, at, runId);
    const paused = applyTaskTimerCommand(
      started,
      { type: 'pause' },
      '2026-08-14T12:03:00.000Z',
      runId,
    );
    expect(paused.status).toBe('paused');
    expect(paused.pausedRemainingSeconds).toBe(420);
    const resumed = applyTaskTimerCommand(
      paused,
      { type: 'resume' },
      '2026-08-14T12:04:00.000Z',
      runId,
    );
    expect(resumed.status).toBe('running');
    expect(resumed.endsAt).toBe('2026-08-14T12:11:00.000Z');
    const changed = applyTaskTimerCommand(
      resumed,
      { type: 'changeDuration', durationSeconds: 300 },
      '2026-08-14T12:05:00.000Z',
      '01J00000000000000000000003',
    );
    expect(changed.runId).not.toBe(runId);
    expect(changed.intervalOrdinal).toBe(1);
    const switched = applyTaskTimerCommand(
      changed,
      { type: 'switch', taskId: '01J00000000000000000000004' },
      '2026-08-14T12:06:00.000Z',
      '01J00000000000000000000005',
    );
    expect(switched.taskId).toBe('01J00000000000000000000004');
    expect(switched.runId).toBe('01J00000000000000000000005');
  });

  it('does not restart a finished timer when repeat is enabled', () => {
    const finished = applyTaskTimerCommand(
      createTaskTimer(ownerId, taskId, at, runId),
      { type: 'stop' },
      '2026-08-14T12:11:00.000Z',
      runId,
    );
    const repeated = applyTaskTimerCommand(
      { ...finished, status: 'finished' },
      { type: 'setRepeat', enabled: true },
      '2026-08-14T12:12:00.000Z',
      runId,
    );
    expect(repeated.status).toBe('finished');
  });
});
