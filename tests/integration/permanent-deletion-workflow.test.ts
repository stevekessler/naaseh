import { describe, expect, it } from 'vitest';
import { nextDeletionCheckpoint } from '../../apps/api/src/deletion/deletion-service.js';

describe('permanent deletion workflow', () => {
  it('resumes monotonically across every purge stage', () => {
    let checkpoint = {};
    const stages: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      checkpoint = nextDeletionCheckpoint(checkpoint);
      stages.push(String(checkpoint.stage));
    }
    expect(stages).toEqual([
      'locked',
      'children',
      'revisions',
      'events',
      'attachments',
      'projections',
      'feeds',
      'complete',
    ]);
    expect(nextDeletionCheckpoint(checkpoint)).toEqual(checkpoint);
  });
});
