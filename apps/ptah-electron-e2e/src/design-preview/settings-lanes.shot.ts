/**
 * Reusable populated Settings > Providers lanes shots for settings fix PRs A/B/D.
 * Run from repository root:
 * node scripts/verify.mjs --exec --task settings-lanes-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts settings-lanes.shot
 * Build first: build-dev and copy-renderer-dev of ptah-electron.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { dynamicMocks, staticMocks } from './settings-lanes.fixtures';

const ROOT = resolve(__dirname, '../../../..');
async function openProviders(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Providers', exact: true })
    .click();
}

const OUT = resolve(
  ROOT,
  process.env['PTAH_SHOT_DIR'] ?? '.ptah/specs/TASK_2026_2259_f0db/screens',
);

test('captures populated Settings Providers lanes at desktop widths', async ({
  ui,
  mainWindow: page,
}) => {
  await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
  await ui.prepare();
  await ui.goto('settings');
  await openProviders(page);

  if ((await page.locator('html').getAttribute('data-theme-mode')) !== 'dark') {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('tab', { name: 'Dark', exact: true }).click();
    await page
      .getByRole('button', { name: 'Ptah Glass', exact: true })
      .first()
      .click();
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');

  const matrix = page.getByTestId('cli-matrix');
  const table = matrix.getByRole('table', { name: 'Lanes', exact: true });
  const rows = table.locator('tbody > tr[data-testid]');
  await expect(matrix).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(4);
  // Pin all five fixture identities, including the unavailable lane and instance.
  for (const id of ['codex', 'claude', 'copilot', 'cursor']) {
    await expect(table.getByTestId(`cli-provider-card-${id}`)).toBeVisible();
  }
  await expect(
    table.getByTestId('cli-matrix-row-preview-openrouter'),
  ).toBeVisible();
  await expect(table.locator('.ptah-table-message-cell')).toHaveCount(0);

  mkdirSync(OUT, { recursive: true });
  const metrics: {
    image: string;
    expanded: boolean;
    rowCount: number;
    pageWidth: number;
    tableWidth: number;
  }[] = [];
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const width of [1440, 1920]) {
      // Remount so each width begins collapsed, even when its expander is hidden.
      if (width === 1920) {
        await ui.prepare();
        await ui.goto('settings');
        await openProviders(page);
        await expect(matrix).toHaveAttribute('aria-busy', 'false');
        await expect.poll(() => rows.count()).toBe(5);
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme-mode',
          'dark',
        );
      }
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await expect
        .poll(() => page.evaluate(() => window.innerWidth))
        .toBe(width);
      const expander = table
        .getByTestId('cli-provider-card-codex')
        .getByRole('button', { name: 'Details for Codex', exact: true });
      for (const expanded of [false, true]) {
        if (expanded) {
          if (await expander.isVisible()) {
            await expander.click();
          } else {
            await table
              .getByTestId('cli-provider-card-codex')
              .getByRole('button', {
                name: 'More actions for Codex',
                exact: true,
              })
              .click();
            await page
              .getByRole('menuitem', { name: 'Details for Codex', exact: true })
              .click();
          }
        }
        await expect(expander).toHaveAttribute(
          'aria-expanded',
          String(expanded),
        );
        if (expanded)
          await expect(page.locator('#lane-detail-codex')).toBeVisible();
        await table.evaluate((element) =>
          element.scrollIntoView({ block: 'center' }),
        );
        await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(4);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        const image = `lanes-${width}-dark${expanded ? '-expanded' : ''}.jpg`;
        await page.screenshot({
          path: join(OUT, image),
          type: 'jpeg',
          quality: 85,
          animations: 'disabled',
        });
        metrics.push({
          image,
          expanded,
          rowCount: await rows.count(),
          pageWidth: await page.evaluate(() => window.innerWidth),
          tableWidth: await table.evaluate(
            (element) => element.getBoundingClientRect().width,
          ),
        });
      }
    }
    writeFileSync(
      join(OUT, 'metrics.json'),
      JSON.stringify(metrics, null, 2) + '\n',
    );
  } finally {
    await cdp.detach();
  }
});
