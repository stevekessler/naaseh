import { expect, test } from '@playwright/test';
import { resizePreservingValue, signIn } from './enhanced-helpers.js';
import { expectFocusNotClipped, expectNoDocumentOverflow } from './responsive-assertions.js';

test('reflow, zoom, and reduced motion preserve values and focus context', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 740 });
  await signIn(page);
  const resizeStartedAt = Date.now();
  await resizePreservingValue(page, 'Task label', 'A long responsive value', 1024, 800);
  const layoutSettleMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const startedAt = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(performance.now() - startedAt)),
        );
      }),
  );
  expect(Date.now() - resizeStartedAt).toBeLessThan(200);
  expect(layoutSettleMs).toBeLessThan(200);
  const label = page.getByLabel('Task label');
  await expectFocusNotClipped(label);
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expect(label).toHaveValue('A long responsive value');
  await expectNoDocumentOverflow(page);
});
