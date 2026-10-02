import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  movable = false,
  onDismiss,
}: {
  timer: TaskTimerRecord;
  now?: string;
  taskLabel: string;
  state?: TimerUiState;
  announcement?: string;
  movable?: boolean;
  onDismiss?: () => void;
  command: (
    command: Exclude<TaskTimerCommand, { type: 'start' | 'switch' }>,
  ) => void | Promise<void>;
}) {
  const projected: EffectiveTaskTimer = effectiveTaskTimer(timer, now);
  const [minutes, setMinutes] = useState(timer.durationSeconds / 60);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<
    | {
        pointerId: number;
        x: number;
        y: number;
        startX: number;
        startY: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      }
    | undefined
  >(undefined);
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset({
      x: Math.min(current.maxX, Math.max(current.minX, current.startX + event.clientX - current.x)),
      y: Math.min(current.maxY, Math.max(current.minY, current.startY + event.clientY - current.y)),
    });
  };
  return (
    <section
      className={`task-timer${movable ? ' task-timer--movable' : ''}`}
      aria-label={`Timer for ${taskLabel}`}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` } as CSSProperties}
    >
      {(movable || onDismiss) && (
        <header className="task-timer-header">
          {movable ? (
            <button
              type="button"
              className="quiet task-timer-drag-handle"
              aria-label="Move timer"
              onPointerDown={(event) => {
                const bounds = event.currentTarget.closest('.task-timer')?.getBoundingClientRect();
                const margin = 8;
                drag.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  startX: offset.x,
                  startY: offset.y,
                  minX: bounds ? offset.x + margin - bounds.left : offset.x,
                  maxX: bounds ? offset.x + window.innerWidth - margin - bounds.right : offset.x,
                  minY: bounds ? offset.y + margin - bounds.top : offset.y,
                  maxY: bounds ? offset.y + window.innerHeight - margin - bounds.bottom : offset.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                drag.current = undefined;
              }}
              onPointerCancel={() => {
                drag.current = undefined;
              }}
            >
              Move
            </button>
          ) : (
            <span />
          )}
          {onDismiss ? (
            <button type="button" className="quiet" aria-label="Close timer" onClick={onDismiss}>
              ×
            </button>
          ) : null}
        </header>
      )}
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
        {projected.status !== 'stopped' ? (
          <button type="button" onClick={() => void command({ type: 'stop' })}>
            Stop timer
          </button>
        ) : null}
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
