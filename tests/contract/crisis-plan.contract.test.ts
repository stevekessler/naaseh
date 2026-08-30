import { describe, expect, it } from 'vitest';
import {
  crisisPlanCreateRequestSchema,
  crisisPlanProblemSchema,
  crisisPlanRoutes,
  crisisPlanSyncPullSchema,
} from '@naaseh/contracts';
import {
  crisisPlanCiphertextFixture,
  crisisPlanOwnerWrapFixture,
  crisisPlanRecordFixture,
} from '../fixtures/crisis-plan.js';

describe('Crisis Plan contract', () => {
  it('accepts ciphertext-only owner creation and actionable errors', () => {
    const request = {
      mutationId: '22222222-2222-4222-8222-222222222222',
      planId: crisisPlanRecordFixture().planId,
      baseVersion: 0,
      keyGeneration: 1,
      body: crisisPlanCiphertextFixture(),
      ownerWrap: crisisPlanOwnerWrapFixture(),
    };
    expect(crisisPlanCreateRequestSchema.parse(request).baseVersion).toBe(0);
    expect(crisisPlanCreateRequestSchema.safeParse({ ...request, html: '<p>no</p>' }).success).toBe(
      false,
    );
    expect(
      crisisPlanProblemSchema.parse({
        code: 'CRISIS_PLAN_REQUIRED',
        message: 'Create a Crisis Plan before your first journal entry.',
        correlationId: 'correlation',
      }).code,
    ).toBe('CRISIS_PLAN_REQUIRED');
  });

  it('defines sync v6 and intentionally omits delete', () => {
    expect(
      crisisPlanSyncPullSchema.parse({ version: 6, changes: [], cursor: 0, hasMore: false })
        .version,
    ).toBe(6);
    expect(crisisPlanRoutes.some((route) => route.method === 'DELETE')).toBe(false);
  });
});
