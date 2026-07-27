import { describe, expect, it } from 'vitest';
import {
  mergeGoogleSnapshots,
  replaceTaskDueDate,
} from '../../apps/api/src/google-sync/merge-service.js';

const base = { title: 'Base', dueDate: '2026-07-25', status: 'open' as const };

describe('Google three-way merge', () => {
  it('merges independent field changes and converges equal concurrent changes', () => {
    expect(
      mergeGoogleSnapshots(base, { ...base, title: 'Local' }, { ...base, dueDate: '2026-07-26' }),
    ).toEqual({
      merged: { title: 'Local', dueDate: '2026-07-26', status: 'open' },
      conflicts: [],
    });
    expect(
      mergeGoogleSnapshots(base, { ...base, status: 'completed' }, { ...base, status: 'completed' })
        .conflicts,
    ).toEqual([]);
  });

  it.each([
    ['title', { title: 'Local' }, { title: 'Remote' }],
    ['dueDate', { dueDate: '2026-07-26' }, { dueDate: '2026-07-27' }],
  ])('retains divergent %s candidates until explicit resolution', (field, local, remote) => {
    const result = mergeGoogleSnapshots(base, { ...base, ...local }, { ...base, ...remote });
    expect(result.conflicts.map((item) => item.field)).toContain(field);
  });

  it('converges binary completion when only one side differs from the common state', () => {
    expect(mergeGoogleSnapshots(base, { ...base, status: 'completed' }, base)).toEqual({
      merged: { ...base, status: 'completed' },
      conflicts: [],
    });
  });

  it('preserves local time through a Google date move across daylight-saving offset changes', () => {
    const changed = replaceTaskDueDate(
      { dueAt: '2026-10-31T15:15:00.000Z', dueTimeZone: 'America/Denver' },
      '2026-11-02',
      '09:00',
      'America/Denver',
    );
    expect(changed.dueAt).toBe('2026-11-02T16:15:00.000Z');
    expect(changed.dueTimeZone).toBe('America/Denver');
  });
});
