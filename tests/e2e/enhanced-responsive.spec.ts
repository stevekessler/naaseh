import { expect, test } from '@playwright/test';
import { addTask, createListWithItem, signIn } from './enhanced-helpers.js';

test.use({ reducedMotion: 'reduce', hasTouch: true });
test('@enhanced-lists primary keyboard and touch journeys have no horizontal overflow', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Responsive task');
  await page.getByRole('button', { name: 'Complete Responsive task' }).press('Enter');
  const list = await createListWithItem(page, 'Responsive list', 'Responsive item');
  await list.getByRole('button', { name: 'Complete Responsive item' }).tap();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByLabel('List total')).toBeVisible();
});
