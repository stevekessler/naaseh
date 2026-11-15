import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { json } from '../shared/http.js';
import { FinanceDashboardPreferenceService } from './dashboard-preference-service.js';
import { FinanceSyncSourceGuard } from './sync-source-guard.js';

const path = '/api/v1/finance/dashboard-preferences';
const flagPath = /^\/api\/v1\/finance\/dashboard-preferences\/([^/]+)\/([^/]+)$/u;
const targetSources = {
  account: 'financeAccount',
  budget: 'financeBudget',
  category: 'financeCategory',
  merchant: 'financeMerchant',
} as const;

export async function dashboardPreferenceResponse(
  event: APIGatewayProxyEventV2,
  userId: string,
  authorize: () => Promise<unknown>,
) {
  const method = event.requestContext.http.method;
  const match = method === 'PUT' ? flagPath.exec(event.rawPath) : null;
  if (!match && (event.rawPath !== path || (method !== 'GET' && method !== 'PATCH')))
    return undefined;

  // Roles do not elevate access to Finance sources or other users' preferences.
  const actor = { id: userId, role: 'user' as const, active: true, groupMemberships: [] };
  const guard = new FinanceSyncSourceGuard({ userId, role: actor.role });
  const service = new FinanceDashboardPreferenceService({
    client: dynamodb,
    tableName,
    authorizeWrite: authorize,
    authorizeTarget: async (_actor, target) => {
      if (!(await guard.readCanonicalSource(targetSources[target.targetKind], target.targetId)))
        return undefined;
      const [first, ...rest] = guard.sourceWriteConditions();
      return first ? [first, ...rest] : undefined;
    },
  });
  const mutationId = event.headers['idempotency-key'];
  const result = match
    ? await service.setFlag(
        actor,
        { targetKind: match[1], targetId: match[2] },
        JSON.parse(event.body ?? '{}'),
        mutationId,
      )
    : method === 'PATCH'
      ? await service.setUpcomingCount(actor, JSON.parse(event.body ?? '{}'), mutationId)
      : await service.read(actor);
  await guard.assertCurrent();
  await authorize();
  return json(200, result);
}
