import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
/** Private receipt evidence only; never includes credentials, headers or authorizer metadata. */
export function financeReplayFingerprint(
  event: APIGatewayProxyEventV2,
  kind:
    | 'budget-edit-v1'
    | 'budget-create-v1'
    | 'budget-account-link-create-v1'
    | 'budget-item-create-v1'
    | 'manual-transaction-create-v1'
    | 'upcoming-expense-create-v1'
    | 'expense-fulfillment-create-v1'
    | 'reusable-create-v1' = 'budget-edit-v1',
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        kind,
        event.requestContext.http.method,
        event.rawPath,
        canonical(JSON.parse(event.body ?? '{}')),
      ]),
    )
    .digest('hex');
}
