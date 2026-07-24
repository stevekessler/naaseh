import { expect, it } from 'vitest';
import { filterTasks } from '../../apps/web/src/search/task-search.js';
import { createTask } from '@naaseh/domain';
it('locked hidden memos do not affect counts', () =>
  expect(
    filterTasks(
      [createTask({ label: 'visible', memoHidden: true, encryptedMemo: 'ciphertext' }, 'u')],
      { query: 'classified', from: '', to: '', assigneeId: '', categoryId: '' },
    ),
  ).toHaveLength(0));
