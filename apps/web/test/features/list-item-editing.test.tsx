// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { memoDocumentText, plainMemoDocument, type ListItem } from '@naaseh/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/memos/MemoEditor.js', () => ({
  MemoEditor: ({ value }: { value: ReturnType<typeof plainMemoDocument> }) => (
    <div aria-label="Memo">{memoDocumentText(value)}</div>
  ),
}));
vi.mock('../../src/features/tasks/useCompletionFeedback.js', () => ({
  useCompletionFeedback: () => ({ complete: vi.fn(), announcement: '' }),
}));

import { ListItemRow } from '../../src/features/lists/ListItemRow.js';

afterEach(cleanup);

const makeItem = (memo?: string): ListItem =>
  ({
    id: 'item',
    listId: 'list',
    status: 'open',
    directorySnapshot: { name: 'Article' },
    ...(memo ? { memo, memoDocument: plainMemoDocument(memo) } : {}),
  }) as ListItem;

describe('list item editing', () => {
  it('preserves a memo that arrives before a link-only edit and groups directory promotion with save', () => {
    const onEdit = vi.fn();
    const props = {
      name: 'Article',
      visibleColumns: new Set(['memo', 'fileLinks', 'actions'] as const),
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onEdit,
      onPromote: vi.fn(),
      destinationLists: [],
      onMove: vi.fn(),
    };
    const view = render(
      <table>
        <tbody>
          <ListItemRow {...props} item={makeItem()} />
        </tbody>
      </table>,
    );

    view.rerender(
      <table>
        <tbody>
          <ListItemRow {...props} item={makeItem('Keep this article note')} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'https://example.com/article' },
    });

    const save = screen.getByRole('button', { name: 'Save item' });
    const promote = screen.getByRole('button', { name: 'Add to directory' });
    expect(save.parentElement).toBe(promote.parentElement);
    fireEvent.click(save);

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: 'Keep this article note',
        fileLinks: ['https://example.com/article'],
      }),
    );
  });
});
