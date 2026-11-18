/**
 * Populated gate shots of Settings > Providers on the REAL backend (visual gate rule 9).
 * Real CLI detection, an isolated home and user data, and one seeded synthetic Ptah CLI instance.
 * Run from repository root, after build-dev and copy-renderer-dev of ptah-electron:
 * node scripts/verify.mjs --exec --task providers-gate-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts settings-providers-gate.shot
 * PTAH_SHOT_DIR sets the output folder, PTAH_SHOT_SUFFIX the file suffix (before | after).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/real-rpc-fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(
  ROOT,
  process.env['PTAH_SHOT_DIR'] ?? '.ptah/specs/TASK_2026_2266_a6fd/screens',
);
const SUFFIX = process.env['PTAH_SHOT_SUFFIX'] ?? 'after';
const SYNTHETIC_NAME = 'Synthetic Lane';

async function openProviders(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Providers', exact: true })
    .click();
}

type ShotTheme = 'dark' | 'light';

/** Selects Ptah Glass (dark) or Ptah Glass Light (light) through the theme picker. */
async function ensureTheme(page: Page, theme: ShotTheme): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) === theme)
    return;
  await page.getByRole('button', { name: 'Change theme' }).click();
  const tile = page
    .getByRole('button', {
      name: theme === 'dark' ? 'Ptah Glass' : 'Ptah Glass Light',
      exact: true,
    })
    .first();
  // The tile sits on one of the category tabs; open each tab until it shows.
  for (const tab of ['Glass', 'Dark', 'Light']) {
    await page
      .getByRole('tablist', { name: 'Theme categories' })
      .getByRole('tab', { name: tab, exact: true })
      .click();
    if (await tile.isVisible()) break;
  }
  await tile.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
}

/** Comma-separated list from an environment variable, or the fallback. */
function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Replaces any visible text that holds the OS user name with a neutral mask (no personal labels in shots). */
async function maskPersonalText(page: Page): Promise<void> {
  const name = userInfo().username;
  await page.evaluate((secret) => {
    if (!secret) return;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (text.toLowerCase().includes(secret.toLowerCase()))
        node.textContent = text.split(new RegExp(secret, 'ig')).join('user');
    }
  }, name);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

/** Clicks a row action inline, or through the row's More actions menu when the narrow layout moved it there. */
async function rowAction(
  page: Page,
  row: Locator,
  laneName: string,
  action: RegExp,
): Promise<void> {
  const inline = row.getByRole('button', { name: action }).first();
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  await row
    .getByRole('button', { name: `More actions for ${laneName}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: action }).first().click();
}

async function openDetail(
  page: Page,
  row: Locator,
  laneName: string,
): Promise<void> {
  const expander = row.getByRole('button', {
    name: `Details for ${laneName}`,
    exact: true,
  });
  if (await expander.first().isVisible()) {
    if ((await expander.first().getAttribute('aria-expanded')) !== 'true')
      await expander.first().click();
    return;
  }
  await rowAction(page, row, laneName, new RegExp(`^Details for ${laneName}$`));
}

/** The created instance id, wherever the response envelope nests `agent` (`data` or `payload`). */
function findAgentId(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const record = value as Record<string, unknown>;
  const agent = record['agent'];
  if (agent && typeof agent === 'object') {
    const id = (agent as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  for (const child of Object.values(record)) {
    const found = findAgentId(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

test('captures populated Settings Providers gate shots on the real backend', async ({
  ui,
  rpcBridge,
  mainWindow: page,
}) => {
  const created = await rpcBridge.sendRpc(
    'rpc',
    {
      type: 'rpc:call',
      payload: {
        method: 'ptahCli:create',
        params: {
          name: SYNTHETIC_NAME,
          providerId: 'ollama-cloud',
          apiKey: 'synthetic-gate-key-0000',
        },
      },
    },
    30_000,
  );
  const instanceId = findAgentId(created);
  expect(instanceId, JSON.stringify(created)).toBeTruthy();

  await ui.goto('settings');
  await openProviders(page);

  const matrix = page.getByTestId('cli-matrix');
  const table = matrix.getByRole('table', { name: 'Lanes', exact: true });
  const rows = table.locator('tbody > tr[data-testid]');
  await expect(matrix).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3);
  const claude = table.getByTestId('cli-provider-card-claude');
  const codex = table.getByTestId('cli-provider-card-codex');
  const instance = table.getByTestId(`cli-matrix-row-${instanceId}`);
  await expect(claude).toBeVisible();
  await expect(instance).toBeVisible();

  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown>[] = [];
  const cdp = await page.context().newCDPSession(page);
  let theme: ShotTheme = 'dark';
  const shot = async (name: string, width: number): Promise<void> => {
    await maskPersonalText(page);
    // Park the pointer so a hover tooltip does not cover the shot.
    await page.mouse.move(1, 1);
    await settle(page);
    const image = `providers-${name}-${theme}-${width}-${SUFFIX}.jpg`;
    await page.screenshot({
      path: join(OUT, image),
      type: 'jpeg',
      quality: 70,
      animations: 'disabled',
    });
    metrics.push({
      image,
      width: await page.evaluate(() => window.innerWidth),
      tableScrollWidth: await table.evaluate(
        (el) => el.parentElement?.scrollWidth ?? 0,
      ),
      tableClientWidth: await table.evaluate(
        (el) => el.parentElement?.clientWidth ?? 0,
      ),
      rowHeights: await rows.evaluateAll((list) =>
        list.map((el) => Math.round(el.getBoundingClientRect().height)),
      ),
    });
  };
  const remount = async (): Promise<void> => {
    await ui.goto('chat');
    await ui.goto('settings');
    await openProviders(page);
    await expect(matrix).toHaveAttribute('aria-busy', 'false');
    await expect(instance).toBeVisible();
  };

  // Full set (all control states, Claude Test) only in dark at 1824 and 600; other runs show layout only.
  const runs = listEnv('PTAH_SHOT_THEMES', 'dark,light').flatMap((mode) =>
    listEnv('PTAH_SHOT_WIDTHS', '1824,1440,1168,784,600').map((size) => ({
      mode: mode === 'light' ? ('light' as const) : ('dark' as const),
      width: Number(size),
    })),
  );

  try {
    for (const run of runs) {
      const width = run.width;
      theme = run.mode;
      const full = theme === 'dark' && (width === 1824 || width === 600);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await expect
        .poll(() => page.evaluate(() => window.innerWidth))
        .toBe(width);
      await ensureTheme(page, theme);
      await remount();

      // 1. Collapsed table.
      // Start at the Lanes section header (title, ring, Edit order, New Ptah CLI instance).
      // The before build (main) has no section header component: fall back to the matrix.
      const header = page.locator('ptah-lanes-section-header').first();
      await ((await header.count()) ? header : matrix).evaluate((el) =>
        el.scrollIntoView({ block: 'start' }),
      );
      await shot('lanes', width);

      // 2. A system lane detail expanded.
      await openDetail(page, codex, 'Codex');
      await expect(page.locator('#lane-detail-codex')).toBeVisible();
      await page.locator('#lane-detail-codex').scrollIntoViewIfNeeded();
      await shot('system-detail', width);

      if (!full) {
        // Layout runs: the instance detail (rev2b 784 expanded) and the defaults (review-a3 1440).
        await remount();
        await openDetail(page, instance, SYNTHETIC_NAME);
        await page
          .locator(`#lane-detail-${instanceId}`)
          .scrollIntoViewIfNeeded();
        await shot('instance-detail', width);
        await remount();
        const sharedAt = page.locator('#shared-defaults-heading');
        if (await sharedAt.count()) {
          await sharedAt.scrollIntoViewIfNeeded();
          await shot('defaults', width);
        }
        continue;
      }

      // 3. The Ptah CLI instance detail expanded.
      await remount();
      await openDetail(page, instance, SYNTHETIC_NAME);
      await expect(page.locator(`#lane-detail-${instanceId}`)).toBeVisible();
      await page.locator(`#lane-detail-${instanceId}`).scrollIntoViewIfNeeded();
      await shot('instance-detail', width);

      // 4. The Claude row after Test: never "instance was not found".
      await remount();
      await openDetail(page, claude, 'Claude');
      const claudeDetail = page.locator('#lane-detail-claude');
      await expect(claudeDetail).toBeVisible();
      const detailTest = claudeDetail
        .getByRole('button', { name: /^Test/ })
        .first();
      if (SUFFIX === 'before' && !(await detailTest.isVisible())) {
        // The before build (main) offers Test as a row action and shows the old defect.
        await rowAction(page, claude, 'Claude', /^Test/);
        await expect
          .poll(() => page.getByText(/connection test/i).count(), {
            timeout: 45_000,
          })
          .toBeGreaterThan(0);
      } else {
        await detailTest.click();
        // The run ends when the detail shows a result: neither "Not run yet" nor "Running".
        await expect
          .poll(
            async () => {
              const text = await claudeDetail.innerText();
              return text.includes('Not run yet') || /Running/.test(text);
            },
            { timeout: 45_000 },
          )
          .toBe(false);
        await expect(
          page.getByText(/This instance was not found/),
        ).toHaveCount(0);
      }
      await claudeDetail.scrollIntoViewIfNeeded();
      await shot('claude-test', width);

      // 5. The permission select: empty (Grok shows "Choose"), value, focus, open menu.
      // A collapsed table shows the select in the detail row, a wide table in the row.
      const permissionOf = async (
        row: Locator,
        laneName: string,
        laneId: string,
      ): Promise<Locator> => {
        const inRow = row.getByLabel(/permission default/i).first();
        if (await inRow.isVisible()) return inRow;
        await openDetail(page, row, laneName);
        return page
          .locator(`#lane-detail-${laneId}`)
          .getByLabel(/permission default/i)
          .first();
      };
      await remount();
      const empty = await permissionOf(
        table.getByTestId('cli-provider-card-grok'),
        'Grok',
        'grok',
      );
      await empty.scrollIntoViewIfNeeded();
      await shot('select-empty', width);
      await remount();
      const permission = await permissionOf(codex, 'Codex', 'codex');
      await permission.scrollIntoViewIfNeeded();
      await shot('select-value', width);
      await permission.focus();
      await shot('select-focus', width);
      await permission.click();
      // The before build (main) may still use a native select, which has no DOM menu.
      if (SUFFIX !== 'before')
        await expect(
          page.getByRole('listbox').or(page.getByRole('menu')).first(),
        ).toBeVisible();
      await shot('select-open', width);
      await page.keyboard.press('Escape');

      // 6. Ptah CLI defaults and Background models.
      const shared = page.locator('#shared-defaults-heading');
      if (await shared.count()) {
        await shared.scrollIntoViewIfNeeded();
        await shot('defaults', width);
      }
      const background = page
        .getByText('Background models', { exact: true })
        .first();
      if (await background.count()) {
        await background.evaluate((el) =>
          el.scrollIntoView({ block: 'start' }),
        );
        await shot('background-models', width);
      }
    }
    writeFileSync(
      join(OUT, `metrics-${SUFFIX}.json`),
      JSON.stringify(metrics, null, 2) + '\n',
    );
  } finally {
    await cdp.detach();
  }
});
