import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';
describe('logger', () => {
  it('defaults verbose off and permanently redacts secrets', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).info('test', {
      password: 'nope',
      safeId: '1',
    });
    expect(lines[0]).not.toContain('nope');
    expect(lines[0]).not.toContain('verbose');
  });
  it('requires literal true', () => {
    const lines: string[] = [];
    createLogger({ VERBOSE_LOGGING: 'TRUE' }, { sink: (line) => lines.push(line) }).info('test');
    expect(lines[0]).not.toContain('verbose');
  });
  it('emits redacted CloudWatch embedded metrics', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).metric('Failures', 1, 'Count', {
      memo: 'never',
    });
    const event = JSON.parse(lines[0]!);
    expect(event._aws.CloudWatchMetrics[0].Namespace).toBe('Naaseh');
    expect(event.memo).toBe('[REDACTED]');
  });

  it('redacts urgency, personal-rank, filter, identifier, and report fields recursively', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).info('ranking', {
      urgency: 'critical',
      urgencyAtCompletion: 'high',
      rank: 1,
      overallPosition: 2,
      orderToken: 'between-a-and-b',
      filterBasis: { urgency: ['critical'] },
      workIds: ['work-1', 'work-2'],
      userId: 'user-1',
      projectId: 'project-1',
      reportTotal: 42,
      nested: { urgencyBreakdown: { critical: 42 } },
    });

    const event = JSON.parse(lines[0]!);
    for (const key of [
      'urgency',
      'urgencyAtCompletion',
      'rank',
      'overallPosition',
      'orderToken',
      'filterBasis',
      'workIds',
      'userId',
      'projectId',
      'reportTotal',
    ]) {
      expect(event[key]).toBe('[REDACTED]');
    }
    expect(event.nested.urgencyBreakdown).toBe('[REDACTED]');
  });

  it('rejects exact affected-count aliases but preserves closed telemetry buckets', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).info('bulk operation', {
      affectedCount: 12,
      affectedItemCount: 12,
      affectedRecordsCount: 12,
      affectedCountBucket: 'eleven_to_hundred',
      examinedCountBucket: 'eleven_to_hundred',
      backlogDepthBucket: 'two_to_ten',
    });

    const event = JSON.parse(lines[0]!);
    expect(event.affectedCount).toBe('[REDACTED]');
    expect(event.affectedItemCount).toBe('[REDACTED]');
    expect(event.affectedRecordsCount).toBe('[REDACTED]');
    expect(event.affectedCountBucket).toBe('eleven_to_hundred');
    expect(event.examinedCountBucket).toBe('eleven_to_hundred');
    expect(event.backlogDepthBucket).toBe('two_to_ten');
  });
});
