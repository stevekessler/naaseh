import { expect, test } from '@playwright/test';
import { addTask, setOffline, signIn } from './enhanced-helpers.js';

async function addTimerTask(page: import('@playwright/test').Page, label: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(
    page.getByRole('button', { name: `Start 10 minute timer for ${label}` }),
  ).toBeVisible();
}

test('timer survives offline navigation and does not complete its task', async ({ page }) => {
  await signIn(page);
  await addTask(page, 'Timer task');
  await setOffline(page);
  await page.getByRole('button', { name: 'Start 10 minute timer for Timer task' }).click();
  const timer = page.getByRole('region', { name: 'Timer for Timer task' });
  await expect(timer.getByText('10:00')).toBeVisible();
  await timer.getByRole('button', { name: 'Pause timer' }).click();
  await expect(timer.getByRole('button', { name: 'Resume timer' })).toBeVisible();
  await page.getByRole('button', { name: 'Post-its', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Timer for Timer task' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Timer task' })).toBeVisible();
});

test('timer changes duration, repeats, and requires confirmation to switch tasks', async ({
  page,
}) => {
  await signIn(page);
  await addTimerTask(page, 'First timer task');
  await addTimerTask(page, 'Second timer task');
  await page.getByRole('button', { name: 'Start 10 minute timer for First timer task' }).click();
  const timer = page.getByRole('region', { name: 'Timer for First timer task' });
  await timer.getByLabel('Minutes').fill('5');
  await timer.getByRole('button', { name: 'Change timer' }).click();
  await expect(timer.getByText('05:00')).toBeVisible();
  await timer.getByLabel('Repeat').click();
  await expect(timer.getByLabel('Repeat')).toBeChecked();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Switch timer to Second timer task' }).click();
  await expect(page.getByRole('region', { name: 'Timer for First timer task' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Switch timer to Second timer task' }).click();
  await expect(page.getByRole('region', { name: 'Timer for Second timer task' })).toBeVisible();
});
