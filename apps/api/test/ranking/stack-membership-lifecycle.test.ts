import { afterEach, describe, expect, it } from 'vitest';
import {
  configureStackMembershipLifecycleSink,
  notifyStackAuthorizationChange,
  notifyStackMembershipWorkChange,
  stackMembershipChangeForWork,
  type StackMembershipLifecycleChange,
  type StackMembershipWorkState,
} from '../../src/ranking/stack-membership-lifecycle.js';

const projectA = '01K00000000000000000000010';
const projectB = '01K00000000000000000000011';
const active = (overrides: Partial<StackMembershipWorkState> = {}): StackMembershipWorkState => ({
  id: '01K00000000000000000000100',
  ownerId: 'owner',
  version: 1,
  updatedAt: '2026-08-05T12:00:00.000Z',
  lifecycle: 'active',
  status: 'open',
  projectId: projectA,
  visibility: 'public',
  ...overrides,
});

let restoreSink: (() => void) | undefined;
afterEach(() => {
  restoreSink?.();
  restoreSink = undefined;
});

describe('personal stack membership lifecycle', () => {
  it('admits created work and restored work with a renewed tail epoch', () => {
    const created = stackMembershipChangeForWork('task', undefined, active());
    const archived = active({
      version: 2,
      updatedAt: '2026-08-05T12:01:00.000Z',
      lifecycle: 'archived',
      status: 'archived',
    });
    const invalidated = stackMembershipChangeForWork('task', active(), archived);
    const restored = stackMembershipChangeForWork(
      'task',
      archived,
      active({ version: 3, updatedAt: '2026-08-05T12:02:00.000Z' }),
    );

    expect(created).toMatchObject({ kind: 'admit', reason: 'create' });
    expect(invalidated).toMatchObject({ kind: 'invalidate', reason: 'archive' });
    expect(restored).toMatchObject({ kind: 'admit', reason: 'restore' });
    expect(restored!.membershipEpoch > created!.membershipEpoch).toBe(true);
  });

  it('preserves overall position while moving membership between Project stacks', () => {
    expect(
      stackMembershipChangeForWork(
        'list',
        active({ projectId: projectA }),
        active({
          projectId: projectB,
          version: 2,
          updatedAt: '2026-08-05T12:01:00.000Z',
        }),
      ),
    ).toMatchObject({
      kind: 'project_reassigned',
      previousProjectId: projectA,
      projectId: projectB,
      preserveOverallPosition: true,
    });
  });

  it('invalidates completed and permanently deleted work', () => {
    expect(
      stackMembershipChangeForWork(
        'task',
        active(),
        active({
          version: 2,
          updatedAt: '2026-08-05T12:01:00.000Z',
          status: 'completed',
          completionState: 'completed',
        }),
      ),
    ).toMatchObject({ kind: 'invalidate' });
    expect(stackMembershipChangeForWork('task', active(), undefined, 'delete')).toMatchObject({
      kind: 'invalidate',
      reason: 'delete',
    });
  });

  it('signals work visibility and group authorization changes for membership reevaluation', () => {
    expect(
      stackMembershipChangeForWork(
        'task',
        active(),
        active({
          version: 2,
          updatedAt: '2026-08-05T12:01:00.000Z',
          visibility: 'private',
        }),
      ),
    ).toMatchObject({ kind: 'authorization_changed', reason: 'authorization' });

    const changes: StackMembershipLifecycleChange[] = [];
    restoreSink = configureStackMembershipLifecycleSink((change) => changes.push(change));
    notifyStackAuthorizationChange({
      userId: 'member',
      groupId: 'group-a',
      active: false,
      changedAt: '2026-08-05T12:02:00.000Z',
    });
    notifyStackMembershipWorkChange('list', undefined, active(), 'create');
    expect(changes).toEqual([
      expect.objectContaining({
        entity: 'authorization',
        userId: 'member',
        groupId: 'group-a',
        active: false,
      }),
      expect.objectContaining({ entity: 'work', kind: 'admit', workType: 'list' }),
    ]);
  });
});
