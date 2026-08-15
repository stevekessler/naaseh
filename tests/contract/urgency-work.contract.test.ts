import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '@naaseh/contracts';
import { entityRevisionSchema, listSchema, taskRevisionSchema, taskSchema } from '@naaseh/domain';

const featureContract = readFileSync(
  'specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml',
  'utf8',
);
const timestamp = '2026-08-05T12:00:00.000Z';
const taskId = '01J00000000000000000000001';
const listId = '01J00000000000000000000002';
const revisionId = '01J00000000000000000000003';

describe('Task and List urgency contract', () => {
  it('defaults omitted Task and List create urgency to Medium', () => {
    expect.soft(contracts.taskCreateSchema.parse({ label: 'Call the dentist' })).toMatchObject({
      label: 'Call the dentist',
      urgency: 'medium',
    });
    expect.soft(contracts.listCreateSchema.parse({ name: 'Packing list' })).toEqual({
      name: 'Packing list',
      urgency: 'medium',
    });
  });

  it.each(['low', 'medium', 'high', 'critical'] as const)(
    'accepts %s on Task and List create and patch',
    (urgency) => {
      expect
        .soft(contracts.taskCreateSchema.safeParse({ label: 'Prioritize me', urgency }).success)
        .toBe(true);
      expect
        .soft(contracts.listCreateSchema.safeParse({ name: 'Prioritize me', urgency }).success)
        .toBe(true);
      expect.soft(contracts.listPatchSchema.safeParse({ urgency }).success).toBe(true);

      const taskPatchSchema = (contracts as Record<string, unknown>).taskPatchSchema as
        | { safeParse(value: unknown): { success: boolean } }
        | undefined;
      expect
        .soft(taskPatchSchema, 'the public contract must expose the Task PATCH validator')
        .toBeDefined();
      expect.soft(taskPatchSchema?.safeParse({ urgency }).success).toBe(true);
    },
  );

  it('rejects unknown and non-categorical urgency values', () => {
    for (const urgency of ['urgent', 'extra_low', 1, null]) {
      expect(contracts.taskCreateSchema.safeParse({ label: 'Invalid', urgency }).success).toBe(
        false,
      );
      expect(contracts.listCreateSchema.safeParse({ name: 'Invalid', urgency }).success).toBe(
        false,
      );
      expect(contracts.listPatchSchema.safeParse({ urgency }).success).toBe(false);
    }
  });

  it('requires current urgency in Task and List read representations', () => {
    expect
      .soft(
        taskSchema.safeParse({
          id: taskId,
          ownerId: 'owner',
          label: 'Ship the release',
          memo: '',
          memoHidden: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          visibility: 'public',
          status: 'open',
          lifecycle: 'active',
          completionState: 'open',
          urgency: 'critical',
          version: 1,
        }).success,
      )
      .toBe(true);
    expect
      .soft(
        listSchema.safeParse({
          id: listId,
          ownerId: 'owner',
          name: 'Release checklist',
          locked: false,
          status: 'active',
          lifecycle: 'active',
          urgency: 'high',
          createdAt: timestamp,
          updatedAt: timestamp,
          version: 1,
        }).success,
      )
      .toBe(true);
  });

  it('declares If-Match conflicts for both urgency PATCH routes', () => {
    for (const route of ['/tasks/{taskId}:', '/lists/{listId}:']) {
      const section = featureContract.slice(featureContract.indexOf(route));
      expect(section).toContain("$ref: '#/components/parameters/IfMatch'");
      expect(section).toMatch(/'409':\s*[\s\S]*?#\/components\/responses\/Conflict/);
    }
  });

  it('carries safe urgency before/after values in Task and List revisions', () => {
    expect(
      taskRevisionSchema.parse({
        id: revisionId,
        taskId,
        actorId: 'owner',
        version: 2,
        changedAt: timestamp,
        operation: 'update',
        changedFields: ['urgency'],
        before: { urgency: 'low' },
        after: { urgency: 'critical' },
      }),
    ).toMatchObject({
      changedFields: ['urgency'],
      before: { urgency: 'low' },
      after: { urgency: 'critical' },
    });
    expect(
      entityRevisionSchema.parse({
        id: revisionId,
        entityType: 'list',
        entityId: listId,
        actorId: 'owner',
        version: 2,
        changedAt: timestamp,
        operation: 'update',
        changedFields: ['urgency'],
        before: { urgency: 'medium' },
        after: { urgency: 'high' },
      }),
    ).toMatchObject({
      entityType: 'list',
      changedFields: ['urgency'],
      before: { urgency: 'medium' },
      after: { urgency: 'high' },
    });
  });
});
