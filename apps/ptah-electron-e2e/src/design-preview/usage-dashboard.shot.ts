/**
 * Opt-in Usage dashboard screenshots (dark and light, three widths).
 * The coordinator runs this against a built Electron app, from the repo root:
 * node scripts/verify.mjs --exec --task usage-dashboard-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts usage-dashboard.shot
 * Build first: build-dev and copy-renderer-dev of ptah-electron.
 * Optional: PTAH_SHOT_DIR overrides the output directory.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { planLimitsSnapshot, usageSummary } from './usage-dashboard.fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(
  ROOT,
  process.env['PTAH_SHOT_DIR'] ??
    '.ptah/specs/TASK_2026_2286_b442/screenshots',
);
const WORKSPACE = 'C:\\demo-workspace';
// Window widths chosen so the content column is about 900, 1200 and 1500 px
// (the content is capped at 1400 px; the real width is read back and logged).
const WIDTHS = [1000, 1300, 1700] as const;
const HEIGHT = 3200;

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) !== theme) {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page
      .getByRole('tab', {
        name: theme === 'dark' ? 'Dark' : 'Light',
        exact: true,
      })
      .click();
    if (
      (await page.locator('html').getAttribute('data-theme-mode')) !== theme
    ) {
      const glass = page
        .getByRole('button', { name: 'Ptah Glass', exact: true })
        .first();
      await (
        (await glass.isVisible())
          ? glass
          : page
              .getByRole('button', { name: /^Ptah/ })
              .first()
      ).click();
    }
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
}

test('captures the Usage dashboard in both themes at three widths', async ({
  ui,
  mainWindow: page,
}) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const now = Date.now();
  await ui.mockRpc({
    'workspace:getInfo': {
      folders: [WORKSPACE],
      root: WORKSPACE,
      activeFolder: WORKSPACE,
      name: 'demo-workspace',
    },
    'analytics:spendSummary': usageSummary(now),
    'provider:getPlanLimits': planLimitsSnapshot(now),
  });
  await ui.prepare();
  await ui.goto('dashboard');
  await expect(page.locator('ptah-usage-dashboard')).toBeVisible();
  await expect(page.getByTestId('usage-chart-svg')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    for (const width of WIDTHS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await expect(page.getByTestId('usage-chart-svg')).toBeVisible();
      await settled(page);
      const box = await page.locator('ptah-usage-dashboard').boundingBox();
      console.log(`usage ${theme} window=${width} content=${Math.round(box?.width ?? 0)}`);
      await page.screenshot({
        path: join(OUT, `usage-${theme}-${width}.png`),
        scale: 'css',
        animations: 'disabled',
      });
    }
  }
});
