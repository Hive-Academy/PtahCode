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

/** Guard every lane, including recovery rows, before capturing each width. */
async function assertLaneMenuGeometry(table: Locator): Promise<void> {
  const rows = table.locator('tr[data-testid]:has([data-lane-status])');
  expect(
    await rows.count(),
    'Lanes geometry requires populated rows',
  ).toBeGreaterThan(0);
  let menuLeft: number | undefined;
  for (const row of await rows.all()) {
    const name = (await row.getAttribute('data-testid')) ?? 'unknown lane';
    const status = row.locator('[data-lane-status]');
    const menu = status.getByRole('button', { name: /^More actions for / });
    const box = await menu.boundingBox();
    const rowBox = await row.boundingBox();
    expect(box, `${name}: missing kebab box`).not.toBeNull();
    expect(rowBox, `${name}: missing row box`).not.toBeNull();
    if (!box || !rowBox) continue;
    menuLeft ??= box.x;
    expect(
      Math.abs(box.x - menuLeft),
      `${name}: kebab x differs from other rows`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box.y + box.height / 2 - rowBox.y - rowBox.height / 2),
      `${name}: kebab is not at row center`,
    ).toBeLessThanOrEqual(1);
    const labels = status.locator(
      '.ptah-status-text, .lane-row-actions > button',
    );
    for (const label of await labels.all()) {
      const labelBox = await label.boundingBox();
      expect(labelBox, `${name}: missing status/recovery box`).not.toBeNull();
      if (!labelBox) continue;
      const intersects =
        box.x < labelBox.x + labelBox.width &&
        box.x + box.width > labelBox.x &&
        box.y < labelBox.y + labelBox.height &&
        box.y + box.height > labelBox.y;
      expect(
        intersects,
        `${name}: kebab overlaps ${await label.innerText()}`,
      ).toBe(false);
    }
  }
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
    // The collapsed table (784 px) once squeezed the Lane column to zero: every
    // visible lane name keeps a readable width. Measure the Lane cell, not the
    // text: a short name such as "Pi" is narrower than 24 px by itself.
    const nameCells = await table
      .locator('.ptah-table-row-title-name')
      .evaluateAll((list) =>
        list
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            // Content width of the cell: a squeezed column keeps only padding.
            // The Lane column is the row header (th scope="row").
            const cell = (el.closest('th, td') ?? el) as HTMLElement;
            const style = getComputedStyle(cell);
            return {
              name: (el.textContent ?? '').trim(),
              tag: cell.tagName,
              width: Math.round(
                cell.clientWidth -
                  parseFloat(style.paddingLeft) -
                  parseFloat(style.paddingRight),
              ),
            };
          }),
      );
    if (SUFFIX !== 'before' && nameCells.length) {
      expect(
        Math.min(...nameCells.map((cell) => cell.width)),
        `${image}: a Lane cell is narrower than 24 px ${JSON.stringify(nameCells)}`,
      ).toBeGreaterThan(24);
    }
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
      // Start at the Lanes section header (title, count, Max concurrent, Reorder).
      // The before build (main) has no section header component: fall back to the matrix.
      const header = page.locator('ptah-lanes-section-header').first();
      await ((await header.count()) ? header : matrix).evaluate((el) =>
        el.scrollIntoView({ block: 'start' }),
      );
      await settle(page);
      await assertLaneMenuGeometry(table);
      await shot('lanes', width);

      if (SUFFIX !== 'before') {
        // 1b. An open ptah-select panel that opens down over the next glass section must stay
        // on top: its lowest option is the element under the pointer (the section that has
        // focus is raised by the page containers). Checked for the last select in the lanes
        // card, the Ptah CLI defaults and Background models.
        const lowestOptionOnTop = async (
          trigger: Locator,
        ): Promise<boolean> => {
          await trigger.evaluate((el) => el.scrollIntoView({ block: 'end' }));
          await trigger.click();
          const listbox = page.getByRole('listbox').last();
          await expect(listbox).toBeVisible();
          const lowest = listbox.getByRole('option').last();
          await lowest.scrollIntoViewIfNeeded();
          const onTop = await lowest.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height / 2,
            );
            return hit !== null && (hit === el || el.contains(hit));
          });
          await page.keyboard.press('Escape');
          return onTop;
        };
        const selectTriggers = [
          page
            .locator(
              '[data-testid^="cli-provider-card-"] [role="combobox"]:not([disabled]):visible',
            )
            .last(),
          page
            .locator(
              '[data-testid="lanes-ptah-defaults"] [role="combobox"]:not([disabled]):visible',
            )
            .last(),
          page
            .locator(
              'ptah-provider-consumer-assignments [role="combobox"]:not([disabled]):visible',
            )
            .last(),
        ];
        for (const trigger of selectTriggers) {
          if (!(await trigger.count())) continue;
          const label = (await trigger.getAttribute('aria-label')) ?? 'select';
          const onTop = await lowestOptionOnTop(trigger);
          metrics.push({
            check: 'lowest-option-on-top',
            theme,
            width,
            label,
            onTop,
          });
          expect(onTop, `${label}: lowest option covered at ${width}px`).toBe(
            true,
          );
        }
        await remount();
      }

      // 2. A system lane detail expanded.
      await openDetail(page, codex, 'Codex');
      await expect(page.locator('#lane-detail-codex')).toBeVisible();
      await page.locator('#lane-detail-codex').scrollIntoViewIfNeeded();
      await shot('system-detail', width);

      if (full && SUFFIX !== 'before') {
        // 2b. A capability chip opens its value in the shared popover.
        const chip = page
          .locator('#lane-detail-codex [data-capability]')
          .first();
        await chip.click();
        await expect(chip).toHaveAttribute('aria-expanded', 'true');
        await shot('capability-popover', width);
        await page.keyboard.press('Escape');

        // 2c. The "N available in catalog" badge opens the catalog names.
        const catalog = page
          .locator('ptah-providers-settings')
          .getByTestId('catalog-hint')
          .first();
        await catalog.scrollIntoViewIfNeeded();
        await catalog.click();
        await expect(
          page.getByTestId('catalog-hint-text').first(),
        ).toBeVisible();
        await shot('catalog-popover', width);
        await page.keyboard.press('Escape');
      }

      if (!full) {
        // Layout runs: the instance detail (rev2b 784 expanded) and the defaults (review-a3 1440).
        await remount();
        await openDetail(page, instance, SYNTHETIC_NAME);
        await page
          .locator(`#lane-detail-${instanceId}`)
          .scrollIntoViewIfNeeded();
        await shot('instance-detail', width);
        await remount();
        const sharedAt = page.locator('[data-testid="lanes-group-ptah"]');
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
        await expect(page.getByText(/This instance was not found/)).toHaveCount(
          0,
        );
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

      // One open field-info gate shot: change only the editor draft, never save it.
      if (SUFFIX !== 'before' && theme === 'dark' && width === 1824) {
        await remount();
        await page.getByTestId('consumer-edit-decision').click();
        await page
          .getByRole('combobox', { name: 'Decision model kind', exact: true })
          .click();
        await page
          .getByRole('option', {
            name: 'Custom endpoint (/v1/systemone)',
            exact: true,
          })
          .click();
        const info = page.getByRole('button', {
          name: 'More about Base URL',
          exact: true,
        });
        await info.scrollIntoViewIfNeeded();
        await info.click();
        const panel = page.getByRole('dialog', {
          name: 'More about Base URL',
          exact: true,
        });
        await expect(panel).toBeVisible();
        await expect(panel).toHaveText(
          'Requests go to this URL plus /v1/systemone. With an API key it must use https, unless the endpoint is on this machine (localhost, [::1] or 127.x.x.x).',
        );
        await shot('base-url-info-open', width);
        await page.keyboard.press('Escape');
        await expect(info).toHaveAttribute('aria-expanded', 'false');
        await expect(panel).toBeHidden();
        const editor = page.getByTestId('consumer-editor-decision');
        if (await editor.isVisible())
          await page.getByTestId('consumer-close-decision').click();
        await expect(editor).toBeHidden();
      }

      // 6. Ptah CLI defaults and Background models.
      const shared = page.locator('[data-testid="lanes-group-ptah"]');
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
