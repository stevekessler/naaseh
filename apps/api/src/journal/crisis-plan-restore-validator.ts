import { crisisPlanRecordSchema, crisisPlanShareSchema } from '@naaseh/domain';

export function validateCrisisPlanRestore(value: {
  plans: unknown[];
  shares: unknown[];
  priorKeyGenerations?: Record<string, number>;
}) {
  const plans = value.plans.map((plan) => crisisPlanRecordSchema.parse(plan));
  const shares = value.shares.map((share) => crisisPlanShareSchema.parse(share));
  const planById = new Map(plans.map((plan) => [plan.planId, plan]));
  for (const plan of plans) {
    const prior = value.priorKeyGenerations?.[plan.planId];
    if (prior !== undefined && plan.keyGeneration < prior)
      throw new Error('Crisis Plan key generation rollback detected.');
  }
  for (const share of shares) {
    const plan = planById.get(share.planId);
    if (!plan || plan.ownerId !== share.ownerId)
      throw new Error('Crisis Plan share owner invariant failed.');
    if (share.state !== 'active' && share.grant)
      throw new Error('Revoked Crisis Plan access cannot restore an active grant.');
    if (share.state === 'active' && share.grant?.keyGeneration !== plan.keyGeneration)
      throw new Error('Crisis Plan grant generation mismatch.');
  }
  return { planCount: plans.length, shareCount: shares.length, plaintextInspected: false };
}
