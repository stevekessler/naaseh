import { expect, it } from 'vitest';
import { redactLogFields } from './index.js';
it('recursively redacts protected fields', () =>
  expect(redactLogFields({ user: { password: 'x' }, memo: 'y' })).toEqual({
    user: { password: '[REDACTED]' },
    memo: '[REDACTED]',
  }));
