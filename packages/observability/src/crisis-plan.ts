export const crisisPlanEvents = [
  'crisis-plan.create',
  'crisis-plan.replace',
  'crisis-plan.trigger',
  'crisis-plan.share',
  'crisis-plan.revoke',
  'crisis-plan.remove-access',
  'crisis-plan.rotate',
  'crisis-plan.broker',
] as const;
export const crisisPlanEventFields = [
  'correlationId',
  'operation',
  'outcome',
  'latencyBucket',
  'schemaVersion',
  'keyGeneration',
  'shareGeneration',
  'retryKind',
  'conflictKind',
  'count',
] as const;
const allowed = new Set<string>(crisisPlanEventFields);
export function sanitizeCrisisPlanEvent(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.has(key)));
}
export const crisisPlanMetricNames = [
  'CrisisPlanOperationCount',
  'CrisisPlanOperationFailure',
  'CrisisPlanConflictCount',
  'CrisisPlanRotationRequired',
  'CrisisPlanBrokerDenied',
  'CrisisPlanKmsFailure',
] as const;
export const crisisPlanOperationalControls = Object.freeze({
  logRetentionDays: 90,
  lowCardinalityOnly: true,
  cloudTrailKmsEvidence: true,
  alwaysOnCompute: false,
  expectedCost:
    'one RSA-3072 sharing key plus request-scaled KMS, Lambda, API, DynamoDB, backup, and log usage',
});
