import { expect, test } from '@playwright/test';
import { setOffline, signIn } from './enhanced-helpers.js';
import { expectMinimumTarget } from './responsive-assertions.js';

test('navigation and primary controls meet touch targets and expose non-color state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await signIn(page);
  for (const control of await page.getByRole('navigation').getByRole('button').all())
    await expectMinimumTarget(control);
  const submit = page.locator('.task-form').first().getByRole('button', { name: 'Add task' });
  await expectMinimumTarget(submit);
  await page.getByRole('button', { name: 'Groups' }).click();
  await setOffline(page);
  const create = page.getByRole('button', { name: 'Create group' });
  await expect(create).toBeDisabled();
  await expect(create).toHaveCSS('text-decoration-line', 'line-through');
});
