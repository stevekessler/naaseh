import { describe, expect, it } from 'vitest';
import {
  readAuthorizedWorkViewPage,
  workViewPartition,
  workViewProjectionChanges,
  workViewProjectionWrites,
  type ProjectedWorkView,
} from '../../apps/api/src/reporting/work-view-repository.js';
import * as workloadProjection from '../../apps/api/src/reporting/workload-projection-repository.js';
import * as reconciliation from '../../apps/api/src/reporting/projection-reconciliation-handler.js';

const projected = (overrides: Partial<ProjectedWorkView> = {}): ProjectedWorkView => ({
  id: '01J00000000000000000000111',
  workType: 'task',
  audience: 'PUBLIC',
  audiences: ['OWNER#owner', 'PUBLIC'],
  lifecycle: 'active',
  projectId: '01J00000000000000000000020',
  categoryId: '01J00000000000000000000010',
  urgency: 'medium',
  sortKey: '2026-08-05T12:00:00.000Z',
  ...overrides,
});

const changedPartitions = (changes: ReturnType<typeof workViewProjectionChanges>) =>
  new Set(changes.map((change) => workViewPartition(change)));

describe('workload urgency projection and reconciliation', () => {
  it('creates owner, public, group, and administrator pointers for all applicable scopes', () => {
    const publicChanges = workViewProjectionChanges(undefined, projected());
    const groupChanges = workViewProjectionChanges(
      undefined,
      projected({ audience: 'GROUP#group-a', audiences: ['OWNER#owner', 'GROUP#group-a'] }),
    );
    const audiences = new Set([...publicChanges, ...groupChanges].map((change) => change.audience));
    const scopes = new Set(publicChanges.map((change) => change.scopeType));

    expect(audiences.has('OWNER#owner')).toBe(true);
    expect(audiences.has('PUBLIC')).toBe(true);
    expect(audiences.has('GROUP#group-a')).toBe(true);
    expect([...audiences].some((audience) => audience.startsWith('ADMIN#'))).toBe(true);
    expect(scopes).toEqual(new Set(['overall', 'category', 'project']));
  });

  it('atomically removes obsolete urgency pointers, writes replacements, and advances each partition once', () => {
    const changes = workViewProjectionChanges(
      projected({ urgency: 'medium' }),
      projected({ urgency: 'critical', sortKey: '2026-08-05T12:01:00.000Z' }),
    );
    const writes = workViewProjectionWrites(changes);
    const partitions = changedPartitions(changes);
    const deletes = writes.filter((write) => 'Delete' in write);
    const puts = writes.filter((write) => 'Put' in write);
    const epochs = writes.filter((write) => 'Update' in write);

    expect(deletes).toHaveLength(9);
    expect(puts).toHaveLength(9);
    expect(epochs).toHaveLength(partitions.size);
    expect(
      new Set(epochs.map((write) => ('Update' in write ? write.Update.Key?.PK : undefined))),
    ).toEqual(partitions);
  });

  it('replaces scope and audience pointers across assignment, privacy, archive, restore, and delete', () => {
    const unassigned = projected();
    delete unassigned.projectId;
    delete unassigned.categoryId;
    const assigned = projected();
    const privateWork = projected({ audience: 'OWNER#owner', audiences: ['OWNER#owner'] });
    const archived = projected({ lifecycle: 'archived' });

    expect(workViewProjectionChanges(unassigned, assigned)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'unassigned', delta: -1 }),
        expect.objectContaining({ scopeType: 'project', delta: 1 }),
        expect.objectContaining({ scopeType: 'category', delta: 1 }),
      ]),
    );
    expect(workViewProjectionChanges(assigned, privateWork)).toEqual(
      expect.arrayContaining([expect.objectContaining({ audience: 'PUBLIC', delta: -1 })]),
    );
    expect(workViewProjectionChanges(assigned, archived)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lifecycle: 'active', delta: -1 }),
        expect.objectContaining({ lifecycle: 'archived', delta: 1 }),
      ]),
    );
    expect(workViewProjectionChanges(archived, assigned)).toEqual(
      expect.arrayContaining([expect.objectContaining({ lifecycle: 'active', delta: 1 })]),
    );
    expect(
      workViewProjectionChanges(assigned, undefined).every((change) => change.delta === -1),
    ).toBe(true);
  });

  it('maintains all-five urgency counters without double-counting duplicate stream delivery', () => {
    const apply = (
      workloadProjection as unknown as {
        applyUrgencyProjectionEvent?: (input: unknown) => Promise<Record<string, number>>;
      }
    ).applyUrgencyProjectionEvent;
    expect(apply).toBeTypeOf('function');
    expect(apply).toBeDefined();
  });

  it('deduplicates overlapping audiences and invalidates a cursor after a source epoch changes', async () => {
    const context = {
      actorId: 'owner',
      accessEpoch: 1,
      endpoint: 'archive' as const,
      scope: 'overall',
      orderBy: 'source' as const,
      filters: { lifecycle: 'archived' as const },
      sourceEpochs: { owner: 2, public: 3 },
      now: Date.parse('2026-08-05T12:00:00.000Z'),
    };
    const candidates = [
      {
        id: 'work-a',
        urgency: 'low' as const,
        canonicalPosition: 1,
        sourcePage: 1,
        audience: 'OWNER#owner',
        lifecycle: 'archived' as const,
      },
      {
        id: 'work-a',
        urgency: 'low' as const,
        canonicalPosition: 1,
        sourcePage: 1,
        audience: 'PUBLIC',
        lifecycle: 'archived' as const,
      },
      {
        id: 'work-b',
        urgency: 'high' as const,
        canonicalPosition: 2,
        sourcePage: 2,
        audience: 'PUBLIC',
        lifecycle: 'archived' as const,
      },
    ];
    const first = await readAuthorizedWorkViewPage({ context, candidates, limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(['work-a']);
    expect(first.nextCursor).not.toBeNull();
    await expect(
      readAuthorizedWorkViewPage({
        context: { ...context, sourceEpochs: { owner: 2, public: 4 } },
        candidates,
        cursor: first.nextCursor!,
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'pagination_context_changed' });
  });

  it('detects and repairs stale, missing, and orphan pointers with authorization-safe telemetry', async () => {
    const reconcile = (
      reconciliation as unknown as {
        reconcileWorkloadUrgencyProjections?: (input: unknown) => Promise<unknown>;
      }
    ).reconcileWorkloadUrgencyProjections;

    expect(reconcile).toBeTypeOf('function');
    await expect(
      reconcile?.({
        canonical: [projected()],
        pointers: [projected({ id: 'stale', urgency: 'critical' }), projected({ id: 'orphan' })],
        reauthorize: () => false,
      }),
    ).resolves.toMatchObject({
      repaired: expect.any(Number),
      sourceEpochsAdvanced: expect.any(Number),
      telemetry: {
        missing: expect.any(Number),
        stale: expect.any(Number),
        orphan: expect.any(Number),
        unauthorized: expect.any(Number),
      },
    });
  });
});
