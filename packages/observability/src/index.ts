import { createLogger } from './logger.js';
import { redact } from './redaction.js';

const logger = createLogger(process.env);

export function log(operation: string, fields: Record<string, unknown> = {}): void {
  logger.info(operation, fields);
}

export const metric = logger.metric;
export { redact as redactLogFields };
export * from './logger.js';
export * from './redaction.js';
export * from './archive-project-reporting.js';
