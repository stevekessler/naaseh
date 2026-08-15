import { log, metric } from '@naaseh/observability';

type AuthSecurityOutcome = 'success' | 'denied' | 'rate_limited' | 'failed';

export function recordAuthSecurityEvent(
  operation: string,
  outcome: AuthSecurityOutcome,
  correlationId: string,
) {
  log('auth.security', { operation, outcome, correlationId });
  metric('AuthSecurityEvents', 1, 'Count', { operation, outcome });
  if (outcome === 'denied' || outcome === 'rate_limited')
    metric('AuthSecurityDenials', 1, 'Count', { operation, outcome });
  if (outcome === 'failed') metric('AuthSecurityFailures', 1, 'Count', { operation });
}
