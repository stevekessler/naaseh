import { describe, expect, it } from 'vitest';
import { createLogger } from '@naaseh/observability';

const forbidden = {
  password: 'password-value',
  pin: '246810',
  authorization: 'Bearer session-value',
  cookie: '__Host-naaseh=session-value',
  csrfToken: 'csrf-value',
  memo: 'private memo',
  label: 'private label',
  payload: { nested: 'mutation-value' },
  before: { nested: 'old-value' },
  after: { nested: 'new-value' },
  ciphertext: 'cipher-value',
  keyMaterial: 'key-value',
  uploadUrl: 'https://signed.example/upload-secret',
};

describe('observability disclosure boundaries', () => {
  it.each([undefined, 'false', 'FALSE', '1', 'yes'])(
    'defaults verbose logging off for %s',
    (value) => {
      const lines: string[] = [];
      createLogger({ VERBOSE_LOGGING: value }, { sink: (line) => lines.push(line) }).info('test', {
        correlationId: 'safe-correlation',
      });
      expect(lines.join('')).not.toContain('"verbose":true');
    },
  );

  it('keeps permanent redaction in literal verbose mode', () => {
    const lines: string[] = [];
    createLogger({ VERBOSE_LOGGING: 'true' }, { sink: (line) => lines.push(line) }).info('test', {
      correlationId: 'safe-correlation',
      ...forbidden,
    });
    const output = lines.join('');
    expect(output).toContain('safe-correlation');
    expect(output).toContain('"verbose":true');
    for (const value of [
      'password-value',
      '246810',
      'session-value',
      'csrf-value',
      'private memo',
      'private label',
      'mutation-value',
      'old-value',
      'new-value',
      'cipher-value',
      'key-value',
      'upload-secret',
    ])
      expect(output).not.toContain(value);
  });
});
