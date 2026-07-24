import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { createLogger, redact } from '@naaseh/observability';
import { createMemoCiphertext, decryptMemo } from '../../apps/web/src/crypto/hidden-memo.js';
import {
  derivePinKey,
  unwrapDekWithPin,
  wrapDekWithPin,
} from '../../apps/web/src/crypto/pin-wrap.js';
import { PostItNote } from '../../apps/web/src/features/postit/PostItNote.js';
import { HiddenMemoIndex } from '../../apps/web/src/search/hidden-memo-index.js';

describe('hidden memo disclosure boundaries', () => {
  it('rejects a wrong PIN and ciphertext copied without its browser key', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'classified');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const correct = await derivePinKey('246810', salt);
    const wrapped = await wrapDekWithPin(encrypted.dek, correct);
    const wrong = await derivePinKey('135791', salt);
    await expect(unwrapDekWithPin(wrapped, wrong)).rejects.toThrow();
    const unrelatedKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'decrypt',
    ]);
    await expect(decryptMemo(encrypted, unrelatedKey)).rejects.toThrow();
  }, 20_000);

  it('purges hidden terms on lock and escapes hostile task text', () => {
    const index = new HiddenMemoIndex();
    index.unlock('memo-1', 'classified phrase');
    expect(index.search('class')).toEqual(['memo-1']);
    index.lock();
    expect(index.search('class')).toEqual([]);
    const task = createTask({ label: '<img src=x onerror=alert(1)>' }, 'steve');
    const markup = renderToStaticMarkup(
      createElement(PostItNote, { task, complete: () => undefined }),
    );
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img');
  });

  it('redacts memo ciphertext, PINs, and key material even in literal verbose mode', () => {
    const lines: string[] = [];
    createLogger({ VERBOSE_LOGGING: 'true' }, { sink: (line) => lines.push(line) }).info(
      'memo.test',
      {
        memo: 'plain',
        pin: '123456',
        ciphertext: 'cipher',
        keyMaterial: 'key',
      },
    );
    expect(lines.join('')).not.toContain('plain');
    expect(lines.join('')).not.toContain('123456');
    expect(lines.join('')).not.toContain('"ciphertext":"cipher"');
    expect(lines.join('')).not.toContain('"keyMaterial":"key"');
    expect(JSON.stringify(redact({ memo: 'plain' }))).not.toContain('plain');
  });
});
