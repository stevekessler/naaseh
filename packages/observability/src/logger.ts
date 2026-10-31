import { redact } from './redaction.js';
export interface LoggerOptions {
  verbose?: boolean;
  sink?: (line: string) => void;
}
export type AdminAuditEvent =
  | 'user.provisioned'
  | 'user.provision_failed'
  | 'user.disabled'
  | 'user.reactivated'
  | 'user.updated'
  | 'category.created'
  | 'category.updated'
  | 'category.archived';
export type EnhancedContentEvent =
  | 'list.mutated'
  | 'list.copied'
  | 'directory.mutated'
  | 'attachment.lifecycle'
  | 'content.admin_read'
  | 'export.lifecycle';
export const enhancedEventAllowlist = new Set<EnhancedContentEvent>([
  'list.mutated',
  'list.copied',
  'directory.mutated',
  'attachment.lifecycle',
  'content.admin_read',
  'export.lifecycle',
]);
export function createLogger(
  environment: Record<string, string | undefined>,
  options: LoggerOptions = {},
) {
  const verbose = environment.VERBOSE_LOGGING === 'true' && options.verbose !== false;
  const sink = options.sink ?? ((line: string) => console.info(line));
  const write = (
    level: 'INFO' | 'ERROR',
    operation: string,
    fields: Record<string, unknown>,
    metric?: { name: string; value: number; unit: string },
  ) =>
    sink(
      JSON.stringify({
        ...(redact({
          level,
          timestamp: new Date().toISOString(),
          operation,
          ...fields,
          ...(verbose ? { verbose: true } : {}),
        }) as Record<string, unknown>),
        ...(metric
          ? {
              _aws: {
                Timestamp: Date.now(),
                CloudWatchMetrics: [
                  {
                    Namespace: 'Naaseh',
                    Dimensions: [[]],
                    Metrics: [{ Name: metric.name, Unit: metric.unit }],
                  },
                ],
              },
            }
          : {}),
      }),
    );
  return {
    info(operation: string, fields: Record<string, unknown> = {}) {
      write('INFO', operation, fields);
    },
    error(operation: string, fields: Record<string, unknown> = {}) {
      write('ERROR', operation, fields);
    },
    metric(name: string, value: number, unit = 'Count', fields: Record<string, unknown> = {}) {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,254}$/.test(name) ||
        !Number.isFinite(value) ||
        !/^[A-Za-z][A-Za-z0-9/]{0,30}$/.test(unit)
      )
        throw new Error('Invalid operational metric descriptor.');
      write(
        'INFO',
        'metric',
        {
          ...fields,
          [name]: value,
        },
        { name, value, unit },
      );
    },
    admin(
      event: AdminAuditEvent,
      fields: {
        correlationId: string;
        actorId?: string;
        resourceId?: string;
        role?: 'user' | 'admin';
        outcome: 'success' | 'failure' | 'denied';
      },
    ) {
      write(event === 'user.provision_failed' ? 'ERROR' : 'INFO', event, fields);
    },
    content(
      event: EnhancedContentEvent,
      fields: {
        correlationId: string;
        actorId?: string;
        resourceId?: string;
        outcome: 'success' | 'failure' | 'denied';
        entityType?: string;
      },
    ) {
      if (!enhancedEventAllowlist.has(event)) throw new Error('Unsupported content event');
      write(
        event === 'attachment.lifecycle' && fields.outcome === 'failure' ? 'ERROR' : 'INFO',
        event,
        fields,
      );
    },
  };
}
