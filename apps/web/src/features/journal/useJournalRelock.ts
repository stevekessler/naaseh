import { useEffect, useRef } from 'react';

export const JOURNAL_RELOCK_DELAY_MS = 5 * 60_000;

export function useJournalRelock(unlocked: boolean, journalActive: boolean, lock: () => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (!unlocked) return;
    let timer: number | undefined;
    const restart = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => lockRef.current(), JOURNAL_RELOCK_DELAY_MS);
    };
    restart();
    if (journalActive) {
      document.addEventListener('pointerdown', restart);
      document.addEventListener('keydown', restart);
      document.addEventListener('input', restart);
      document.addEventListener('visibilitychange', restart);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('pointerdown', restart);
      document.removeEventListener('keydown', restart);
      document.removeEventListener('input', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [journalActive, unlocked]);
}
