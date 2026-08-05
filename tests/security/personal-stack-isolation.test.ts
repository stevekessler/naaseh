import { describe, expect, it } from 'vitest';
import { canReadTaskAs, createTask } from '@naaseh/domain';
import { stackPageQuerySchema } from '@naaseh/contracts';
import { redact } from '@naaseh/observability';
import {
  assertPersonalStackOwner,
  eligiblePersonalStackOrder,
  personalStackScopeSchema,
  workReferenceSchema,
} from '../../packages/domain/src/personal-stack.js';

const workId = '01K00000000000000000000100';
const revokedId = '01K00000000000000000000101';
const deletedId = '01K00000000000000000000102';
const ref = (id: string, epoch: string) =>
  workReferenceSchema.parse({ workType: 'task', workId: id, membershipEpoch: epoch });

describe('personal stack isolation', () => {
  it('allows only the authenticated owner to read or mutate a stack scope', () => {
    const scope = personalStackScopeSchema.parse({ userId: 'owner', scopeType: 'overall' });
    expect(() => assertPersonalStackOwner(scope, 'owner')).not.toThrow();
    expect(() => assertPersonalStackOwner(scope, 'other')).toThrow(/owner|private/i);
    expect(() => assertPersonalStackOwner(scope, 'admin')).toThrow(/owner|private/i);
  });

  it('does not let administrators request another user rank through report or stack queries', () => {
    expect(stackPageQuerySchema.safeParse({ userId: 'target' }).success).toBe(false);
    expect(stackPageQuerySchema.safeParse({ targetUserId: 'target' }).success).toBe(false);
  });

  it('never treats rank as content authorization evidence', () => {
    const privateTask = Object.assign(createTask({ label: 'Private' }, 'owner'), {
      visibility: 'private' as const,
      overallPosition: 1,
      projectPosition: 1,
    });
    expect(
      canReadTaskAs(privateTask, {
        id: 'other',
        role: 'user',
        active: true,
        groupIds: [],
      }).allowed,
    ).toBe(false);
  });

  it('removes revoked and hard-deleted work without returning former positions', () => {
    const active = ref(workId, '1');
    const revoked = ref(revokedId, '2');
    const deleted = ref(deletedId, '3');
    expect(
      eligiblePersonalStackOrder(
        [active, revoked, deleted],
        new Set([`${active.workType}:${workId}:1`]),
      ),
    ).toEqual([active]);
  });

  it('redacts owner IDs, bulk work IDs, ranks, and position tokens from logs', () => {
    expect(
      redact({
        userId: 'owner',
        projectId: 'project',
        workIds: [workId, revokedId],
        rank: 1,
        overallPosition: 1,
        orderToken: 'secret-order',
      }),
    ).toEqual({
      userId: '[REDACTED]',
      projectId: '[REDACTED]',
      workIds: '[REDACTED]',
      rank: '[REDACTED]',
      overallPosition: '[REDACTED]',
      orderToken: '[REDACTED]',
    });
  });
});
