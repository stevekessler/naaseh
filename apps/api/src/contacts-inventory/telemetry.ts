import { createLogger } from '@naaseh/observability';

type Operation = 'checkpoint' | 'changes' | 'contacts' | 'inventory' | 'catalogs' | 'unknown';

export function featureOperation(path: string): Operation {
  if (path === 'sync/checkpoint') return 'checkpoint';
  if (path === 'changes') return 'changes';
  if (path === 'contacts' || path.startsWith('contacts/')) return 'contacts';
  if (path === 'items' || path.startsWith('items/')) return 'inventory';
  if (path === 'catalogs' || path.startsWith('catalogs/')) return 'catalogs';
  return 'unknown';
}

export function createFeatureTelemetry(sink?: (entry: string) => void) {
  const logger = createLogger(process.env, { verbose: false, ...(sink ? { sink } : {}) });
  return (
    operation: Operation,
    requestId: string | undefined,
    status: number,
    latency: number,
    mutation = false,
  ) => {
    const correlationId =
      requestId && /^[A-Za-z0-9_=-]{1,128}$/u.test(requestId) ? requestId : undefined;
    const fields = { operationType: operation, correlationId, status, latencyMs: latency };
    logger.info('contactsInventory.request', fields);
    if (mutation) logger.info('contactsInventory.audit', fields);
    logger.metric('ContactsInventoryLatency', latency, 'Milliseconds');
    if (status >= 500) logger.metric('ContactsInventoryRequestFailures', 1);
  };
}
