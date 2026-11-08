import type { Locator, Page } from '@playwright/test';

export const hold = (page: Page, ms = 2000): Promise<void> => page.waitForTimeout(ms);
export const holdEnding = (page: Page): Promise<void> => hold(page, 3000);

export async function revealSlowly(page: Page, locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await hold(page, 1000);
  await locator.waitFor({ state: 'visible' });
}

export async function pointTo(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Cannot point to an element outside the visible page');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
}
