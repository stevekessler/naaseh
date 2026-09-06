import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { crisisPlanSharingInfrastructure } from '../../infra/lib/crisis-plan-sharing-stack.js';

describe('Crisis Plan administrator and recovery isolation', () => {
  it('grants sharing-key decrypt only to the broker with no plan-body table access', () => {
    expect(crisisPlanSharingInfrastructure.permissions.broker).toContain(
      'kms:Decrypt:crisis-plan-sharing-key',
    );
    expect(crisisPlanSharingInfrastructure.broker.bodyTableRead).toBe(false);
    expect(crisisPlanSharingInfrastructure.permissions.admin).toEqual([]);
    expect(crisisPlanSharingInfrastructure.permissions.recoveryAdmin).toEqual([]);
    expect(crisisPlanSharingInfrastructure.permissions.ordinaryApi).toEqual([]);
  });

  it('keeps credential-bearing user records out of the broker process', () => {
    const handler = readFileSync('apps/api/src/journal/crisis-plan-broker-handler.ts', 'utf8');
    const repository = readFileSync(
      'apps/api/src/journal/crisis-plan-broker-repository.ts',
      'utf8',
    );
    expect(handler).not.toMatch(/userById|passwordHash|pinHash/);
    expect(repository).toContain("ProjectionExpression: 'brokerActive'");
    expect(repository).not.toMatch(/passwordHash|pinHash|ProjectionExpression: ['"]data/);
  });
});
