import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createUlid, type Mutation } from '@naaseh/domain';
import { ConflictItem } from '../../src/features/sync/ConflictReview.js';

it('identifies a conflicted list item and its parent list by name', () => {
  const mutation: Mutation = {
    id: createUlid(),
    entityId: createUlid(),
    entityType: 'listItem',
    operation: 'complete',
    baseVersion: 2,
    payload: { status: 'completed' },
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const html = renderToStaticMarkup(
    <ConflictItem
      conflict={{
        id: mutation.id,
        mutation,
        reason: 'hard_deleted',
        message: 'This list item no longer exists on the server.',
        display: { entityLabel: 'Buy milk', parentLabel: 'Groceries' },
      }}
      synchronize={async () => undefined}
    />,
  );

  expect(html).toContain('<h3>Buy milk</h3>');
  expect(html).toContain('List: Groceries');
  expect(html).not.toContain('listItem conflict');

  const stale = renderToStaticMarkup(
    <ConflictItem
      conflict={{
        id: mutation.id,
        mutation,
        createdAt: '2026-01-01T00:00:00.000Z',
        reason: 'version_mismatch',
      }}
      synchronize={async () => undefined}
    />,
  );
  expect(stale).toContain('more than seven days old');
  expect(stale).toContain('It will not expire automatically');
});

it('offers encrypted-only choices for a Journal lifecycle conflict', () => {
  const html = renderToStaticMarkup(
    <ConflictItem
      conflict={{
        id: 'journal:entry',
        reason: 'journal_version_mismatch',
        source: 'journal',
        message: 'This encrypted Journal entry changed elsewhere.',
      }}
      synchronize={async () => undefined}
    />,
  );
  expect(html).toContain('Journal entry conflict');
  expect(html).toContain('Keep my encrypted version');
  expect(html).toContain('Keep server version');
  expect(html).not.toContain('ciphertext');
  expect(html).not.toContain('Item reference');
});
