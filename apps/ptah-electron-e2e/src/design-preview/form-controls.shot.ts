/**
 * Gate rule 9 shots of the shared form controls (ptah-field text inputs and ptah-select) on the
 * UI gallery page of the development renderer build, with isolated user data. Run from
 * repository root:
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
const HEIGHT = 1100;

async function setTheme(page: Page, mode: 'dark' | 'light'): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) === mode) return;
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('tab', { name: mode === 'dark' ? 'Dark' : 'Light', exact: true }).click();
  const html = page.locator('html');
  if ((await html.getAttribute('data-theme-mode')) !== mode) {
    const glass = page.getByRole('button', { name: 'Ptah Glass', exact: true }).first();
    await (await glass.isVisible() ? glass : page.locator('button.theme-tile:visible').first()).click();
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode);
}

/**
 * The sidebar link to the UI gallery shows only when NODE_ENV=development, and that mode moves user
 * data out of the isolated test folder. So the spec navigates as the link does
 * (router.navigateByUrl('/ui-gallery')), with the router of a mounted component, found through the
 * Angular debug API of the development renderer build.
 */
async function openGallery(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const debug = (window as Window & { ng?: { getComponent(el: Element): unknown } }).ng;
    if (!debug) return 'no Angular debug API';
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.tagName.includes('-')) continue;
      const component: unknown = debug.getComponent(el);
      if (!component || typeof component !== 'object') continue;
      for (const value of Object.values(component)) {
        if (!value || typeof value !== 'object' || !('navigateByUrl' in value)) continue;
        const navigate = value.navigateByUrl;
        if (typeof navigate !== 'function') continue;
        void navigate.call(value, '/ui-gallery');
        return 'ok';
      }
    }
    return 'no mounted component with a router';
  });
  expect(result).toBe('ok');
}

async function rest(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
}

/** A shot of the target with 16 px around it, so the floated labels of the first row show. */
async function shoot(page: Page, target: Locator, name: string): Promise<void> {
  await page.waitForTimeout(300);
  const box = await target.boundingBox();
  if (!box) throw new Error(`${name}: the target has no box`);
  const view = page.viewportSize() ?? { width: 1824, height: HEIGHT };
  const x = Math.max(0, box.x - 16);
  const y = Math.max(0, box.y - 16);
  await page.screenshot({
    path: resolve(OUT, `${name}-${PHASE}.jpg`),
    type: 'jpeg',
    quality: 72,
    clip: {
      x,
      y,
      width: Math.min(view.width, box.x + box.width + 16) - x,
      height: Math.min(view.height, box.y + box.height + 16) - y,
    },
  });
}

/** One shot of the open menu and the grid it belongs to. */
async function shootOpenMenu(page: Page, grid: Locator, name: string, width: number): Promise<void> {
  await grid.getByRole('combobox', { name: 'Effort', exact: true }).click();
  const listbox = page.getByRole('listbox', { name: 'Effort', exact: true });
  await expect(listbox).toBeVisible();
  const box = await grid.boundingBox();
  const menu = await listbox.boundingBox();
  if (!box || !menu) throw new Error('The grid or the menu has no box');
  const top = Math.max(0, Math.min(box.y, menu.y) - 16);
  const bottom = Math.min(HEIGHT, Math.max(box.y + box.height, menu.y + menu.height) + 16);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(OUT, `${name}-${PHASE}.jpg`),
    type: 'jpeg',
    quality: 72,
    clip: { x: 0, y: top, width, height: bottom - top },
  });
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
}

test('captures the shared field and select states on the UI gallery', async ({ ui, mainWindow: page }) => {
  await ui.prepare();
  mkdirSync(OUT, { recursive: true });
  const cdp = await page.context().newCDPSession(page);

  for (const theme of ['dark', 'light'] as const) {
    // The theme menu is in the Settings header, not on the gallery page.
    await ui.goto('settings');
    await setTheme(page, theme);
    await openGallery(page);
    for (const width of theme === 'dark' ? [1824, 600] : [1824]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      const fields = page.getByTestId('form-controls-field-states');
      await expect(fields).toBeVisible({ timeout: 30_000 });
      const tag = `${theme}-${width}`;

      // Field states: empty without focus, filled, error, disabled, a placeholder that rests.
      await rest(page, fields);
      await shoot(page, fields, `gallery-fields-${tag}`);
      await fields.getByRole('textbox', { name: 'Branch prefix' }).focus();
      await shoot(page, fields, `gallery-fields-focus-${tag}`);

      // The settings field grid (prototype row Default model, Port, Effort).
      const grid = page.getByTestId('form-controls-settings-grid');
      await rest(page, grid);
      await shoot(page, grid, `gallery-settings-grid-${tag}`);
      await grid.getByRole('textbox', { name: 'Request timeout' }).focus();
      await shoot(page, grid, `gallery-settings-grid-focus-${tag}`);

      // Compact select in setting rows: the row title is the label.
      const rows = page.getByTestId('form-controls-settings-rows');
      await rest(page, rows);
      await shoot(page, rows, `gallery-setting-rows-${tag}`);

      // One open designed menu (never the native menu).
      await rest(page, grid);
      await shootOpenMenu(page, grid, `gallery-select-open-${tag}`, width);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});
