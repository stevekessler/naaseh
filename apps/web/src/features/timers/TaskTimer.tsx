import { useState } from 'react';
import type {
  EffectiveTaskTimer,
  TaskTimer as TaskTimerRecord,
  TaskTimerCommand,
} from '@naaseh/domain';
import { effectiveTaskTimer } from '@naaseh/domain';
import { timerStatusText, type TimerUiState } from './useTaskTimer.js';

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function TaskTimer({
  timer,
  now = new Date().toISOString(),
  taskLabel,
  state = 'idle',
  announcement = '',
  command,
}: {
  timer: TaskTimerRecord;
  now?: string;
  taskLabel: string;
  state?: TimerUiState;
  announcement?: string;
  command: (
    command: Exclude<TaskTimerCommand, { type: 'start' | 'switch' }>,
  ) => void | Promise<void>;
}) {
  const projected: EffectiveTaskTimer = effectiveTaskTimer(timer, now);
  const [minutes, setMinutes] = useState(timer.durationSeconds / 60);
  return (
    <section className="task-timer" aria-label={`Timer for ${taskLabel}`}>
      <p className="timer-clock" aria-label={`${projected.remainingSeconds} seconds remaining`}>
        {clock(projected.remainingSeconds)}
      </p>
      <p>
        {projected.status === 'running' ? `Focusing on ${taskLabel}` : `Timer ${projected.status}`}
      </p>
      <div className="timer-controls">
        {projected.status === 'running' ? (
          <button type="button" onClick={() => void command({ type: 'pause' })}>
            Pause timer
          </button>
        ) : projected.status === 'paused' ? (
          <button type="button" onClick={() => void command({ type: 'resume' })}>
            Resume timer
          </button>
        ) : (
          <button type="button" onClick={() => void command({ type: 'restart' })}>
            Restart timer
          </button>
        )}
        <button type="button" onClick={() => void command({ type: 'stop' })}>
          Stop timer
        </button>
        <label>
          <input
            type="checkbox"
            checked={timer.repeatEnabled}
            onChange={(event) => void command({ type: 'setRepeat', enabled: event.target.checked })}
          />{' '}
          Repeat
        </label>
        <label>
          Minutes
          <input
            type="number"
            min={1}
            max={1_440}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={!Number.isInteger(minutes) || minutes < 1 || minutes > 1_440}
          onClick={() => void command({ type: 'changeDuration', durationSeconds: minutes * 60 })}
        >
          Change timer
        </button>
      </div>
      <p role="status" aria-live="polite">
        {announcement || timerStatusText(state)}
      </p>
    </section>
  );
}
