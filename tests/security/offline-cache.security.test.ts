import { expect, it } from 'vitest';
import { canReadTask, createTask } from '@naaseh/domain';
it('never admits another owner private task into an authorized cache', () =>
  expect(canReadTask(createTask({ label: 'private', visibility: 'private' }, 'a'), 'b')).toBe(
    false,
  ));
