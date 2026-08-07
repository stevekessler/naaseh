import { describe, expect, it, vi } from 'vitest';
import { createPersonalStackRankOverlayReader } from '../../src/reporting/organization-tree-service.js';
import type { PersonalStackService } from '../../src/ranking/stack-service.js';

const actor = { id: 'viewer-a', role: 'user' as const, active: true, groupIds: [] };
const ref = (workId: string, projectId?: string) => ({
  workType: 'task' as const,
  workId,
  membershipEpoch: 'epoch-1',
  urgency: 'medium' as const,
  ...(projectId ? { projectId } : {}),
});

describe('viewer-private reporting rank overlay', () => {
  it('loads the viewer overall stack once and each applicable Project stack independently', async () => {
    const read = vi.fn(async (input: Parameters<PersonalStackService['read']>[0]) => ({
      version: 4,
      items:
        input.scope.scopeType === 'overall'
          ? [ref('work-b', 'project-a'), ref('work-c'), ref('work-a', 'project-a')]
          : [ref('work-a', 'project-a'), ref('work-b', 'project-a')],
    }));
    const overlay = createPersonalStackRankOverlayReader({
      read,
      reorder: vi.fn(),
    } as unknown as PersonalStackService);

    await expect(
      overlay({
        actor,
        work: [
          { id: 'work-a', workType: 'task', projectId: 'project-a' },
          { id: 'work-b', workType: 'task', projectId: 'project-a' },
        ],
      }),
    ).resolves.toEqual(
      new Map([
        ['task:work-b', { overallRank: 1, projectRank: 2 }],
        ['task:work-c', { overallRank: 2 }],
        ['task:work-a', { overallRank: 3, projectRank: 1 }],
      ]),
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'viewer-a',
        actor,
        scope: { userId: 'viewer-a', scopeType: 'overall' },
      }),
    );
  });
});
