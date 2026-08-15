import { expect, test, type Page } from '@playwright/test';
import { expandTaskDetails, mockSuccessfulSync, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => mockSuccessfulSync(page));

async function createTask(page: Page, label: string, urgency: string) {
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await expandTaskDetails(form);
  await form.getByLabel('Priority', { exact: true }).selectOption(urgency);
  await form.getByRole('button', { name: 'Add task' }).click();
}

const row = (page: Page, label: string) => page.getByRole('listitem').filter({ hasText: label });

test('keeps pointer/touch drag and keyboard ranking equivalent with compact priority marks', async ({
  page,
}, testInfo) => {
  await signIn(page);
  await createTask(page, 'Drag first', 'critical');
  await createTask(page, 'Drag second', 'low');
  await page.getByRole('button', { name: 'Personal Stack' }).click();

  const first = row(page, 'Drag first');
  const second = row(page, 'Drag second');
  await expect(first.getByLabel('Priority: Critical')).toHaveText('!');
  await expect(second.getByLabel('Priority: Low')).toHaveText('○');
  const handle = second.getByRole('button', { name: 'Drag Drag second' });
  if (testInfo.project.name !== 'chromium') {
    const box = await handle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const moveUp = second.getByRole('button', { name: 'Move up' });
    if (testInfo.project.name === 'webkit') await moveUp.click();
    else await moveUp.tap();
  } else await handle.dragTo(first);
  await expect(second).toContainText('Overall position 1');
  await expect(page.locator('.stack-sync-state')).toContainText(/pending|position|synced|applied/i);

  const moveDown = second.getByRole('button', { name: 'Move down' });
  await moveDown.focus();
  await moveDown.press('Enter');
  await expect(second).toContainText('Overall position 2');
  await expect(second).toBeFocused();

  await expect(page.locator('.stack-list')).not.toHaveCSS('overflow-x', 'scroll');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
