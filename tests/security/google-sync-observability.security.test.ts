import { describe, expect, it } from 'vitest';
import { redact } from '@naaseh/observability';

describe('Google synchronization observability', () => {
  it('allows operational dimensions while fuzz-redacting content and credentials', () => {
    for (const field of [
      'taskTitle',
      'googleNotes',
      'authorizationCode',
      'refreshToken',
      'dueDate',
    ])
      expect(redact({ [field]: `sensitive-${field}`, outcome: 'retry' })).toEqual({
        [field]: '[REDACTED]',
        outcome: 'retry',
      });
  });
});
