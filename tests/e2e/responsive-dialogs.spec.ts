import { test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';
import {
  expectContained,
  expectNoDocumentOverflow,
  expectReachableInUsableViewport,
} from './responsive-assertions.js';

test('native dialog actions remain reachable in a phone dynamic viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page);
  await page.getByRole('button', { name: 'Groups' }).click();
  await page.getByRole('button', { name: 'Create group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create group' });
  await expectContained(dialog.getByLabel('Group name'), dialog);
  await expectReachableInUsableViewport(dialog.getByRole('button', { name: 'Cancel' }));
  await expectNoDocumentOverflow(page);
});
