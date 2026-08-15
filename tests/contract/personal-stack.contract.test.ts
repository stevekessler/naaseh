import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '@naaseh/contracts';

const openapi = readFileSync(
  'specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml',
  'utf8',
);
const workId = '01J00000000000000000000001';
const secondWorkId = '01J00000000000000000000002';
const thirdWorkId = '01J00000000000000000000003';
const projectId = '01J00000000000000000000004';
const mutationId = '01J00000000000000000000005';
const operationId = '01J00000000000000000000006';
const now = '2026-08-05T12:00:00.000Z';

const reference = (id: string) => ({
  workType: 'task' as const,
  workId: id,
  membershipEpoch: `epoch-${id}`,
});

const simpleRequest = {
  scope: 'overall' as const,
  baseVersion: 7,
  move: {
    kind: 'simple_move' as const,
    movedWork: reference(workId),
    afterWork: reference(secondWorkId),
  },
};

describe('personal stack HTTP and sync contract', () => {
  it('publishes owner-private overall and Project read routes with paginated responses', () => {
    for (const value of [
      '/stacks/overall:',
      'operationId: getOverallStack',
      '/projects/{projectId}/stack:',
      'operationId: getProjectStack',
      '#/components/schemas/StackPage',
    ])
      expect(openapi).toContain(value);

    expect
      .soft(
        contracts.stackPageSchema.safeParse({
          scope: 'overall',
          version: 8,
          snapshotThroughVersion: 7,
          asOf: now,
          items: [],
          nextCursor: 'opaque-next-page',
        }).success,
      )
      .toBe(true);
    expect
      .soft(
        contracts.stackPageSchema.safeParse({
          scope: 'project',
          projectId,
          version: 3,
          snapshotThroughVersion: 3,
          asOf: now,
          items: [],
          nextCursor: null,
        }).success,
      )
      .toBe(true);
    expect
      .soft(
        contracts.stackPageSchema.safeParse({
          scope: 'project',
          version: 3,
          snapshotThroughVersion: 3,
          asOf: now,
          items: [],
          nextCursor: null,
        }).success,
      )
      .toBe(false);
  });

  it('validates pagination defaults, bounds, and opaque cursor inputs', () => {
    expect(contracts.stackPageQuerySchema.parse({})).toEqual({ limit: 100, contentType: 'all' });
    expect(
      contracts.stackPageQuerySchema.parse({
        cursor: 'opaque',
        limit: '200',
        contentType: 'lists',
      }),
    ).toEqual({ cursor: 'opaque', limit: 200, contentType: 'lists' });
    expect(contracts.stackPageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(contracts.stackPageQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    for (const response of [
      '#/components/responses/InvalidCursor',
      '#/components/responses/PaginationContextChanged',
      '#/components/responses/CursorExpired',
    ])
      expect(openapi).toContain(response);
  });

  it('accepts typed simple and filtered reorder writes', () => {
    expect(contracts.reorderRequestSchema.parse(simpleRequest)).toMatchObject(simpleRequest);
    expect(
      contracts.reorderRequestSchema.parse({
        scope: 'project',
        baseVersion: 3,
        move: {
          kind: 'filtered_permutation',
          movedWork: reference(workId),
          destinationIndex: 1,
          affectedWork: [reference(workId), reference(secondWorkId), reference(thirdWorkId)],
          filterBasis: { urgencies: ['low', 'critical'], projectId },
        },
      }).move.kind,
    ).toBe('filtered_permutation');
  });

  it('rejects filtered permutations that cannot describe exact occupied slots', () => {
    const base = {
      kind: 'filtered_permutation' as const,
      movedWork: reference(workId),
      destinationIndex: 1,
      affectedWork: [reference(workId), reference(secondWorkId)],
      filterBasis: { urgencies: ['high' as const] },
    };
    expect
      .soft(
        contracts.filteredPermutationSchema.safeParse({
          ...base,
          affectedWork: [reference(secondWorkId), reference(thirdWorkId)],
        }).success,
        'the moved work must be present in the affected occupied-slot sequence',
      )
      .toBe(false);
    expect
      .soft(
        contracts.filteredPermutationSchema.safeParse({
          ...base,
          affectedWork: [reference(workId), reference(workId)],
        }).success,
        'affected work references must be unique',
      )
      .toBe(false);
    expect
      .soft(
        contracts.filteredPermutationSchema.safeParse({ ...base, destinationIndex: 2 }).success,
        'destinationIndex must identify an occupied slot in affectedWork',
      )
      .toBe(false);
  });

  it('publishes operation status and validates applied and pending results', () => {
    expect(openapi).toContain('/stack-operations/{operationId}:');
    expect(openapi).toContain('operationId: getStackOperation');
    expect(
      contracts.reorderResultSchema.parse({
        operationId,
        mutationId,
        status: 'pending_compaction',
        stackVersion: 8,
        retryAfterSeconds: 2,
      }),
    ).toMatchObject({ operationId, status: 'pending_compaction', retryAfterSeconds: 2 });
  });

  it('requires typed idempotency and mutation-security headers for reorder writes', () => {
    for (const header of ['x-csrf-token', 'x-client-id', 'x-client-mutation-id'])
      expect(openapi).toContain(`name: ${header}`);

    const reorderHeadersSchema = (contracts as Record<string, unknown>).reorderHeadersSchema as
      | { safeParse(value: unknown): { success: boolean } }
      | undefined;
    expect
      .soft(
        reorderHeadersSchema,
        'the runtime contract must expose the reorder idempotency/security header validator',
      )
      .toBeDefined();
    expect
      .soft(
        reorderHeadersSchema?.safeParse({
          'x-csrf-token': '0123456789abcdef',
          'x-client-id': 'browser-a',
          'x-client-mutation-id': mutationId,
        }).success,
      )
      .toBe(true);
    expect
      .soft(
        reorderHeadersSchema?.safeParse({
          'x-csrf-token': '0123456789abcdef',
          'x-client-id': 'browser-a',
        }).success,
      )
      .toBe(false);
  });

  it('accepts personal stack sync only under contract version 4', () => {
    const mutation = {
      id: mutationId,
      entityId: operationId,
      entityType: 'personalStackOperation' as const,
      operation: 'reorder' as const,
      baseVersion: 7,
      payload: simpleRequest,
      createdAt: now,
      attempts: 0,
    };
    expect(
      contracts.urgencyStackPushRequestSchema.safeParse({
        contractVersion: 4,
        mutations: [mutation],
      }).success,
    ).toBe(true);
    expect(
      contracts.pushRequestSchema.safeParse({ contractVersion: 3, mutations: [mutation] }).success,
    ).toBe(false);
  });

  it('validates actionable typed conflict and generic problem responses', () => {
    expect(
      contracts.stackConflictProblemSchema.parse({
        code: 'stack_conflict',
        message: 'Reload this stack and try again.',
        correlationId: 'request-1',
        reason: 'filter_basis_changed',
        currentVersion: 9,
      }),
    ).toMatchObject({ reason: 'filter_basis_changed', currentVersion: 9 });
    expect(
      contracts.stackConflictProblemSchema.safeParse({
        code: 'stack_conflict',
        message: 'Retry.',
        correlationId: 'request-1',
        reason: 'unknown_reason',
        currentVersion: 9,
      }).success,
    ).toBe(false);
    expect(
      contracts.problemSchema.parse({
        code: 'cursor_expired',
        message: 'Restart pagination.',
        correlationId: 'request-2',
      }),
    ).toMatchObject({ code: 'cursor_expired' });
  });
});
