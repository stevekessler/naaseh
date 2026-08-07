import { describe, expect, it, vi } from 'vitest';

const readLocalStack = vi.hoisted(() => vi.fn());
vi.mock('../../src/db/personal-stack-repository.js', () => ({ readLocalStack }));

import {
  applyOccupiedSlotPermutation,
  createOccupiedSlotPermutation,
} from '../../src/features/stacks/filtered-permutation.js';
import {
  selectLocalStackItems,
  selectRankOverlays,
  selectStackItems,
} from '../../src/features/stacks/stack-selectors.js';

const reference = (suffix: string, membershipEpoch = `epoch-${suffix}`) => ({
  workType: 'task' as const,
  workId: `01J000000000000000000000${suffix}`,
  membershipEpoch,
});
const a = reference('01');
const hiddenLow = reference('02');
const b = reference('03');
const hiddenMedium = reference('04');
const c = reference('05');
const projectId = '01J00000000000000000000009';

describe('personal-stack browser selectors', () => {
  it('uses the domain occupied-slot rule without moving hidden work', () => {
    const order = [a, hiddenLow, b, hiddenMedium, c];
    const move = createOccupiedSlotPermutation({
      order,
      movedWork: c,
      destinationIndex: 0,
      matches: (work) => [a.workId, b.workId, c.workId].includes(work.workId),
    });

    expect(move.affectedWork).toEqual([a, b, c]);
    expect(applyOccupiedSlotPermutation(order, move)).toEqual([c, hiddenLow, a, hiddenMedium, b]);
  });

  it('produces independent dense one-based overall and Project overlays', () => {
    const work = [{ reference: a, projectId }, { reference: b, projectId }, { reference: c }];
    const ranked = selectRankOverlays(work, {
      overall: [c, a, hiddenLow, b],
      projects: new Map([[projectId, [b, a]]]),
    });

    expect(ranked.map(({ work: item, rank }) => [item.reference.workId, rank])).toEqual([
      [a.workId, { overallPosition: 2, projectPosition: 2 }],
      [b.workId, { overallPosition: 3, projectPosition: 1 }],
      [c.workId, { overallPosition: 1 }],
    ]);
  });

  it('filters after overlaying ranks and appends missing eligible work deterministically', () => {
    const tailFirstByEpoch = reference('06', 'epoch-0');
    const work = [
      { reference: a, urgency: 'high' },
      { reference: b, urgency: 'critical' },
      { reference: tailFirstByEpoch, urgency: 'high' },
      { reference: c, urgency: 'low' },
    ];
    const selected = selectStackItems({
      eligibleWork: work,
      orders: { overall: [a, c, b] },
      scope: { scopeType: 'overall' },
      matches: (item) => item.urgency === 'high',
    });

    expect(
      selected.map(({ work: item, rank }) => [item.reference.workId, rank.overallPosition]),
    ).toEqual([
      [a.workId, 1],
      [tailFirstByEpoch.workId, 4],
    ]);
  });

  it('reads encrypted local overall and Project orders for offline overlays', async () => {
    readLocalStack.mockImplementation(async (_ownerId, scope) =>
      scope.scopeType === 'overall' ? { work: [b, a] } : { work: [a, b] },
    );
    const selected = await selectLocalStackItems({
      ownerId: 'viewer',
      eligibleWork: [
        { reference: a, projectId },
        { reference: b, projectId },
      ],
      scope: { scopeType: 'project', scopeId: projectId },
    });

    expect(selected.map(({ work, rank }) => [work.reference.workId, rank])).toEqual([
      [a.workId, { overallPosition: 2, projectPosition: 1 }],
      [b.workId, { overallPosition: 1, projectPosition: 2 }],
    ]);
  });
});
