import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';
import {
  archiveProjectReportingEvents,
  assertArchiveProjectReportingEvent,
} from '../src/archive-project-reporting.js';

describe('archive/project/reporting telemetry', () => {
  it('allows only the documented lifecycle events', () => {
    for (const event of archiveProjectReportingEvents)
      expect(() => assertArchiveProjectReportingEvent(event)).not.toThrow();
    expect(() => assertArchiveProjectReportingEvent('task.content.dump')).toThrow();
  });

  it('redacts names, tokens, filters, and report values', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).info('report.request', {
      categoryName: 'PAAO',
      confirmationToken: 'secret',
      query: 'API',
      reportValue: 9,
      correlationId: 'safe',
    });
    const event = JSON.parse(lines[0]!);
    expect(event).toMatchObject({
      categoryName: '[REDACTED]',
      confirmationToken: '[REDACTED]',
      query: '[REDACTED]',
      reportValue: '[REDACTED]',
      correlationId: 'safe',
    });
  });
});
