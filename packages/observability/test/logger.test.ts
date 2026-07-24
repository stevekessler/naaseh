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
});
