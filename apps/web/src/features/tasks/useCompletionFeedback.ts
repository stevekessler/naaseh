import { useCallback, useEffect, useState } from 'react';
import { loadCompletionSound } from '../../db/preferences-repository.js';

export function playScrunch(
  audioFactory: () => Pick<HTMLAudioElement, 'play' | 'volume'> = () =>
    new Audio('/sounds/post-it-scrunch.ogg'),
) {
  const audio = audioFactory();
  audio.volume = 0.35;
  const playback = audio.play();
  if (playback) void playback.catch(() => undefined);
}
export const completionAnnouncement = (label: string, completing = true) =>
  `${label} ${completing ? 'completed' : 'reopened'}.`;

export function useCompletionFeedback() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    void loadCompletionSound().then(setSoundEnabled);
  }, []);
  const complete = useCallback(
    (label: string, completing = true) => {
      if (completing && soundEnabled) playScrunch();
      setAnnouncement(completionAnnouncement(label, completing));
    },
    [soundEnabled],
  );
  return { complete, announcement, soundEnabled };
}
