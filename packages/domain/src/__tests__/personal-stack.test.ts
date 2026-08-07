import { describe, expect, it } from 'vitest';
import {
  applyFilteredPermutation,
  applySimpleMove,
  orderImplicitTail,
  personalStackScopeSchema,
  replayPersonalStack,
  stackScopeIdentity,
  workReferenceIdentity,
  workReferenceSchema,
  type WorkReference,
} from '../personal-stack.js';

const projectId = '01K00000000000000000000010';
const workIds = {
  a: '01K00000000000000000000100',
  b: '01K00000000000000000000101',
  c: '01K00000000000000000000102',
  d: '01K00000000000000000000103',
  hiddenOne: '01K00000000000000000000110',
  hiddenTwo: '01K00000000000000000000111',
  hiddenThree: '01K00000000000000000000112',
} as const;

const ref = (
  workId: string,
  membershipEpoch: string,
  workType: WorkReference['workType'] = 'task',
): WorkReference => workReferenceSchema.parse({ workType, workId, membershipEpoch });

const a = ref(workIds.a, '00000000000000000001');
const b = ref(workIds.b, '00000000000000000002', 'list');
const c = ref(workIds.c, '00000000000000000003');
const d = ref(workIds.d, '00000000000000000004', 'list');

describe('personal stack', () => {
  it('gives overall and per-Project scopes distinct user-owned identities', () => {
    const overall = personalStackScopeSchema.parse({ userId: 'user-a', scopeType: 'overall' });
    const project = personalStackScopeSchema.parse({
      userId: 'user-a',
      scopeType: 'project',
      scopeId: projectId,
    });

    expect(stackScopeIdentity(overall)).toBe('user-a:overall');
    expect(stackScopeIdentity(project)).toBe(`user-a:project:${projectId}`);
    expect(stackScopeIdentity({ ...project, userId: 'user-b' })).not.toBe(
      stackScopeIdentity(project),
    );
    expect(
      personalStackScopeSchema.safeParse({ userId: 'user-a', scopeType: 'project' }).success,
    ).toBe(false);
    expect(
      personalStackScopeSchema.safeParse({
        userId: 'user-a',
        scopeType: 'overall',
        scopeId: projectId,
      }).success,
    ).toBe(false);
  });

  it('treats a renewed authorization epoch as a new membership for the same work', () => {
    const firstAdmission = ref(workIds.a, 'group-a:00000000000000000007');
    const restoredAdmission = ref(workIds.a, 'group-a:00000000000000000019');

    expect(firstAdmission.workId).toBe(restoredAdmission.workId);
    expect(workReferenceIdentity(firstAdmission)).not.toBe(
      workReferenceIdentity(restoredAdmission),
    );
    expect(workReferenceSchema.safeParse({ ...firstAdmission, membershipEpoch: '' }).success).toBe(
      false,
    );
    expect(
      workReferenceSchema.safeParse({ ...firstAdmission, membershipEpoch: 'x'.repeat(65) }).success,
    ).toBe(false);
  });

  it('orders the implicit tail by membership epoch, then work type and immutable ID', () => {
    const sameEpochTaskHighId = ref(workIds.c, '00000000000000000009', 'task');
    const sameEpochTaskLowId = ref(workIds.a, '00000000000000000009', 'task');
    const sameEpochList = ref(workIds.b, '00000000000000000009', 'list');
    const newest = ref(workIds.d, '00000000000000000010', 'task');

    const input = [newest, sameEpochTaskHighId, sameEpochList, sameEpochTaskLowId];
    expect(orderImplicitTail(input)).toEqual([
      sameEpochList,
      sameEpochTaskLowId,
      sameEpochTaskHighId,
      newest,
    ]);
    expect(input).toEqual([newest, sameEpochTaskHighId, sameEpochList, sameEpochTaskLowId]);
  });

  it('replays a simple move between coherent full-stack anchors without mutating input', () => {
    const order = [a, b, c, d];

    expect(
      applySimpleMove(order, {
        kind: 'simple_move',
        movedWork: d,
        beforeWork: a,
        afterWork: b,
      }),
    ).toEqual([a, d, b, c]);
    expect(applySimpleMove(order, { kind: 'simple_move', movedWork: c, afterWork: a })).toEqual([
      c,
      a,
      b,
      d,
    ]);
    expect(applySimpleMove(order, { kind: 'simple_move', movedWork: a, beforeWork: d })).toEqual([
      b,
      c,
      d,
      a,
    ]);
    expect(order).toEqual([a, b, c, d]);
    expect(() =>
      applySimpleMove(order, {
        kind: 'simple_move',
        movedWork: d,
        beforeWork: a,
        afterWork: c,
      }),
    ).toThrow(/anchor/i);
  });

  it('replays a compacted snapshot, later operations, and deterministic implicit tail', () => {
    const snapshot = [a, b, c];
    const tailNewest = ref(workIds.hiddenTwo, '00000000000000000011');
    const tailOldest = ref(workIds.hiddenOne, '00000000000000000010', 'list');

    expect(
      replayPersonalStack({
        snapshot,
        operations: [
          { kind: 'simple_move', movedWork: c, afterWork: a },
          { kind: 'simple_move', movedWork: b, beforeWork: a },
        ],
        implicitTail: [tailNewest, tailOldest],
      }),
    ).toEqual([c, a, b, tailOldest, tailNewest]);
    expect(snapshot).toEqual([a, b, c]);
  });

  it('permutes only matching work among occupied slots while hidden work stays exact', () => {
    const hiddenOne = ref(workIds.hiddenOne, '00000000000000000005');
    const hiddenTwo = ref(workIds.hiddenTwo, '00000000000000000006', 'list');
    const hiddenThree = ref(workIds.hiddenThree, '00000000000000000007');
    const fullOrder = [a, hiddenOne, b, hiddenTwo, c, hiddenThree, d];

    const result = applyFilteredPermutation(fullOrder, {
      kind: 'filtered_permutation',
      movedWork: d,
      destinationIndex: 1,
      affectedWork: [a, b, c, d],
    });

    expect(result).toEqual([a, hiddenOne, d, hiddenTwo, b, hiddenThree, c]);
    expect(result[1]).toBe(hiddenOne);
    expect(result[3]).toBe(hiddenTwo);
    expect(result[5]).toBe(hiddenThree);
    expect(fullOrder).toEqual([a, hiddenOne, b, hiddenTwo, c, hiddenThree, d]);
  });

  it('rejects filtered permutations with an invalid or stale affected sequence', () => {
    const hidden = ref(workIds.hiddenOne, '00000000000000000005');
    const fullOrder = [a, hidden, b, c, d];

    expect(() =>
      applyFilteredPermutation(fullOrder, {
        kind: 'filtered_permutation',
        movedWork: d,
        destinationIndex: 0,
        affectedWork: [a, c, b, d],
      }),
    ).toThrow(/affected|order|stale/i);
    expect(() =>
      applyFilteredPermutation(fullOrder, {
        kind: 'filtered_permutation',
        movedWork: hidden,
        destinationIndex: 0,
        affectedWork: [a, b, c, d],
      }),
    ).toThrow(/affected|matching/i);
  });
});
