import { useEffect, useMemo, useState } from 'react';
import { effectiveTaskTimer, type TaskTimer } from '@naaseh/domain';
import { claimTimerFeedback } from '../../db/task-timer-repository.js';

export type TimerUiState = 'idle' | 'pending' | 'conflict' | 'unavailable';
export const timerStatusText = (state: TimerUiState) =>
  ({
    idle: '',
    pending: 'Timer change pending synchronization.',
    conflict: 'Timer conflict needs your attention.',
    unavailable: 'Timer is unavailable until task access is restored.',
  })[state];

export function useTaskTimer(timer: TaskTimer | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!timer || timer.status !== 'running') return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 250);
    const visible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [timer]);
  const projected = useMemo(
    () => (timer ? effectiveTaskTimer(timer, new Date(now).toISOString()) : undefined),
    [timer, now],
  );
  useEffect(() => {
    if (!projected?.feedback) return;
    void claimTimerFeedback(projected.ownerId, projected.taskId, projected.feedback).then(
      (claimed) => claimed && setAnnouncement('Timer interval complete.'),
    );
  }, [projected?.feedback?.runId, projected?.feedback?.intervalOrdinal]);
  return { projected, announcement };
}
