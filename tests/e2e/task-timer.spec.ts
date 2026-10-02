import { expect, test } from '@playwright/test';
import { addTask, setOffline, signIn } from './enhanced-helpers.js';

async function addTimerTask(page: import('@playwright/test').Page, label: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByRole('button', { name: 'Add task' }).click();
  await openTaskActions(page, label);
  await expect(
    page.getByRole('button', { name: `Start 10 minute timer for ${label}` }),
  ).toBeVisible();
}

async function openTaskActions(page: import('@playwright/test').Page, label: string) {
  const actions = page.getByRole('button', { name: `Actions for ${label}` });
  if ((await actions.locator('xpath=parent::details').getAttribute('open')) === null)
    await actions.click();
}

test('timer survives offline navigation and does not complete its task', async ({ page }) => {
  await signIn(page);
  await addTask(page, 'Timer task');
  await setOffline(page);
  await openTaskActions(page, 'Timer task');
  await page.getByRole('button', { name: 'Start 10 minute timer for Timer task' }).click();
  const timer = page.getByRole('region', { name: 'Timer for Timer task' });
  await expect(timer.getByText('10:00')).toBeVisible();
  await timer.getByRole('button', { name: 'Pause timer' }).click();
  await expect(timer.getByRole('button', { name: 'Resume timer' })).toBeVisible();
  await timer.getByRole('button', { name: 'Close timer' }).click();
  await expect(timer).toBeHidden();
  await page.getByRole('button', { name: 'Post-its', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await openTaskActions(page, 'Timer task');
  await expect(page.getByRole('region', { name: 'Timer for Timer task' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Timer task' })).toBeVisible();
});

test('timer changes duration, repeats, and requires confirmation to switch tasks', async ({
  page,
}) => {
  await signIn(page);
  await addTimerTask(page, 'First timer task');
  await addTimerTask(page, 'Second timer task');
  await expect(
    page
      .getByRole('button', { name: 'Actions for First timer task' })
      .locator('xpath=parent::details'),
  ).not.toHaveAttribute('open', '');
  await page.getByText('2 tasks', { exact: true }).click();
  await openTaskActions(page, 'First timer task');
  await page.getByRole('button', { name: 'Start 10 minute timer for First timer task' }).click();
  const timer = page.getByRole('region', { name: 'Timer for First timer task' });
  const beforeMove = await timer.boundingBox();
  const moveHandle = timer.getByRole('button', { name: 'Move timer' });
  const handleBox = await moveHandle.boundingBox();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x - 40, handleBox!.y + 60);
  await page.mouse.up();
  await expect.poll(async () => (await timer.boundingBox())?.x).not.toBe(beforeMove?.x);
  await timer.getByLabel('Minutes').fill('5');
  await timer.getByRole('button', { name: 'Change timer' }).click();
  await expect(timer.getByText('05:00')).toBeVisible();
  await timer.getByLabel('Repeat').click();
  await expect(timer.getByLabel('Repeat')).toBeChecked();
  await timer.getByRole('button', { name: 'Close timer' }).click();
  await openTaskActions(page, 'Second timer task');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Switch timer to Second timer task' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch timer to Second timer task' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Switch timer to Second timer task' }).click();
  const secondTimer = page.getByRole('region', { name: 'Timer for Second timer task' });
  await expect(secondTimer).toBeVisible();
  await secondTimer.getByRole('button', { name: 'Stop timer' }).click();
  await expect(secondTimer).toContainText('Timer stopped');
  await secondTimer.getByRole('button', { name: 'Close timer' }).click();
  await expect(secondTimer).toBeHidden();
});
