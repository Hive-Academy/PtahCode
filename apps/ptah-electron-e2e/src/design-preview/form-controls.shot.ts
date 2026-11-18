/**
 * Gate rule 9 shots of the shared form controls (ptah-field text inputs and ptah-select) on the
 * UI gallery page of the Electron dev instance. Run from repository root with NODE_ENV=development
 * (the gallery link shows only in a dev instance):
 * node scripts/verify.mjs --exec --task form-controls-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts form-controls.shot
 * Build first: build-dev and copy-renderer-dev of ptah-electron.
 * PTAH_SHOT_DIR sets the output folder, PTAH_SHOT_PHASE sets the file suffix (before or after).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(ROOT, process.env['PTAH_SHOT_DIR'] ?? '.ptah/tmp/form-controls-shots');
const PHASE = process.env['PTAH_SHOT_PHASE'] ?? 'after';

async function setTheme(page: Page, mode: 'dark' | 'light'): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) === mode) return;
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('tab', { name: mode === 'dark' ? 'Dark' : 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Ptah Glass', exact: true }).first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode);
}

async function shoot(page: Page, target: Locator, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await target.screenshot({ path: resolve(OUT, `${name}-${PHASE}.jpg`), type: 'jpeg', quality: 72 });
}

test('captures the shared field and select states on the UI gallery', async ({ ui, mainWindow: page }) => {
  await ui.prepare();
  await ui.goto('settings');
  mkdirSync(OUT, { recursive: true });
  const cdp = await page.context().newCDPSession(page);

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    for (const width of theme === 'dark' ? [1824, 600] : [1824]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      const link = page.getByTestId('workspace-sidebar-ui-gallery-link');
      if (!(await page.getByTestId('form-controls-field-states').isVisible())) {
        await ui.goto('settings');
        await expect(link, 'Run with NODE_ENV=development: the gallery link is dev only').toBeVisible();
        await link.click();
      }
      const fields = page.getByTestId('form-controls-field-states');
      await expect(fields).toBeVisible({ timeout: 30_000 });
      await fields.scrollIntoViewIfNeeded();
      const tag = `${theme}-${width}`;

      // Empty without focus, filled, error, disabled (and a placeholder that rests).
      await shoot(page, fields, `gallery-fields-${tag}`);

      // Focus on the empty field with a placeholder: the label floats, the placeholder shows.
      await fields.getByRole('textbox', { name: 'Branch prefix' }).focus();
      await shoot(page, fields, `gallery-fields-focus-${tag}`);
      await page.keyboard.press('Tab');

      const selects = page.getByTestId('form-controls-rich-select');
      await selects.scrollIntoViewIfNeeded();
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await shoot(page, selects, `gallery-selects-${tag}`);

      // One open designed menu (never the native menu).
      const provider = selects.getByRole('combobox', { name: 'Provider' });
      await provider.click();
      const listbox = page.getByRole('listbox', { name: 'Provider' });
      await expect(listbox).toBeVisible();
      const box = await selects.boundingBox();
      const menu = await listbox.boundingBox();
      if (box && menu) {
        const top = Math.max(0, Math.min(box.y, menu.y) - 16);
        const bottom = Math.max(box.y + box.height, menu.y + menu.height) + 16;
        await page.waitForTimeout(300);
        await page.screenshot({
          path: resolve(OUT, `gallery-select-open-${tag}-${PHASE}.jpg`),
          type: 'jpeg',
          quality: 72,
          clip: { x: 0, y: top, width, height: Math.min(1100, bottom) - top },
        });
      }
      await page.keyboard.press('Escape');
      await expect(listbox).toBeHidden();
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});
