import { expect, type Locator, type Page } from '@playwright/test';

export const featureViewports = {
  desktop: { width: 1280, height: 800 },
  iphone: { width: 390, height: 844 },
  ipad: { width: 820, height: 1180 },
} as const;

export async function openModalAndRememberTrigger(trigger: Locator, dialog: Locator) {
  await trigger.focus();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty('open', true);
  return async () => {
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  };
}

export async function expectFocusInsideDialog(page: Page, dialog: Locator) {
  const dialogHandle = await dialog.elementHandle();
  expect(dialogHandle).not.toBeNull();
  const containsFocus = await page.evaluate(
    (element) => element instanceof HTMLDialogElement && element.contains(document.activeElement),
    dialogHandle,
  );
  expect(containsFocus).toBe(true);
}

export async function setBrowserOffline(page: Page, offline = true) {
  await page.context().setOffline(offline);
  await page.evaluate((nextOffline) => {
    window.dispatchEvent(new Event(nextOffline ? 'offline' : 'online'));
  }, offline);
}

export async function dragWithPointer(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) return;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}

export async function assertZoomReflow(page: Page, essentialControl: Locator) {
  await page.evaluate(() => document.documentElement.style.setProperty('zoom', '2'));
  await expect(essentialControl).toBeVisible();
  const box = await essentialControl.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

export async function emulateReducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true);
}
