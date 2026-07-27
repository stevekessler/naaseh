import { describe, expect, it } from 'vitest';
import { summarizeGoogleLinks } from '../../apps/api/src/google-sync/control-service.js';
import { mergeGoogleSnapshots } from '../../apps/api/src/google-sync/merge-service.js';

describe('Google synchronization bounded performance', () => {
  it('summarizes 5,000 links and merges 100 changes within a local release budget', () => {
    const links = Array.from({ length: 5_000 }, (_, index) => ({
      state: index % 10 === 0 ? 'retired' : 'linked',
      origin: index % 2 ? ('google' as const) : ('naaseh' as const),
    }));
    const started = performance.now();
    expect(summarizeGoogleLinks(links)).toEqual({ linkedCount: 4_500, naasehOriginCount: 2_000 });
    for (let index = 0; index < 100; index += 1) {
      const base = { title: `Task ${index}`, dueDate: '2026-07-25', status: 'open' as const };
      expect(
        mergeGoogleSnapshots(
          base,
          { ...base, title: `Local ${index}` },
          { ...base, dueDate: '2026-07-26' },
        ).conflicts,
      ).toHaveLength(0);
    }
    expect(performance.now() - started).toBeLessThan(250);
  });
});
