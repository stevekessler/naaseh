import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompletionSoundSetting } from '../../src/features/tasks/CompletionSoundSetting.js';
import {
  completionAnnouncement,
  playScrunch,
} from '../../src/features/tasks/useCompletionFeedback.js';
describe('completion feedback', () => {
  it('uses a default-on accessible setting and shared announcements', () => {
    const html = renderToStaticMarkup(<CompletionSoundSetting />);
    expect(html).toContain('Completion sounds');
    expect(completionAnnouncement('Milk', true)).toBe('Milk completed.');
    expect(completionAnnouncement('Milk', false)).toBe('Milk reopened.');
  });
  it('starts playback synchronously and ignores rejected browser playback', async () => {
    const rejected = Promise.reject(new Error('blocked'));
    rejected.catch(() => undefined);
    const play = vi.fn(() => rejected);
    expect(() =>
      playScrunch(() => ({ volume: 0, play }) as Pick<HTMLAudioElement, 'play' | 'volume'>),
    ).not.toThrow();
    expect(play).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});
