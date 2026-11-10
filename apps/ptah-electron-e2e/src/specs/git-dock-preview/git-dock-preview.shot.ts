import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { test, expect } from '../../support/real-rpc-fixtures';
import { createScratchRepo } from '../../support/git-scratch-repo';

/**
 * Design preview capture for the detachable Git dock (TASK_2026_906, PR #1038).
 *
 * Real RPC only: the app runs on a scratch repository, and the detached Git
 * view is a second BrowserWindow that reads Git data through the real
 * handlers. Nothing is mocked. Output: JPEG files in PTAH_PREVIEW_OUT
 * (default: dist/apps/ptah-electron-e2e/git-dock-preview-shots).
 *
 * Each optional state runs in `attempt()`: a state that cannot be reached is
 * written to the log and the capture continues with the next state.
 */
const OUT =
  process.env['PTAH_PREVIEW_OUT'] ??
  join(
    __dirname,
    '../../../../../dist/apps/ptah-electron-e2e/git-dock-preview-shots',
  );

type Mode = 'dark' | 'light';
const MODES: readonly Mode[] = ['dark', 'light'];

async function setTheme(page: Page, mode: Mode): Promise<void> {
  const theme = mode === 'dark' ? 'ptah-glass' : 'ptah-glass-light';
  const html = page.locator('html');
  if ((await html.getAttribute('data-theme')) !== theme) {
    // Same steps as `specs/theme/theme.spec.ts`: the picker is a popover that
    // stays open after a pick, and only the tiles of the active tab exist.
    const panel = page.locator('div.dropdown-content[role="dialog"]');
    const toggle = page.locator('[aria-label="Change theme"]');
    const isOpen = () => panel.evaluate((el) => el.matches(':popover-open'));
    if (!(await isOpen())) await toggle.click();
    await panel.waitFor({ state: 'visible' });
    const tile = panel.locator(`button[data-theme="${theme}"]`);
    for (const label of ['Glass', 'Light', 'Dark']) {
      const tab = panel.getByRole('tab', { name: label, exact: true });
      await tab.dispatchEvent('click');
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      if ((await tile.count()) === 1) {
        await tile.dispatchEvent('click');
        break;
      }
    }
    await expect(html).toHaveAttribute('data-theme', theme);
    await page.keyboard.press('Escape');
    if (await isOpen()) await toggle.click();
    await expect(panel).toBeHidden();
  }
  await page.waitForTimeout(600);
}

async function shoot(
  page: Page,
  name: string,
  target?: Locator,
): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.jpg`);
  const base = { path, type: 'jpeg', quality: 78, animations: 'disabled' } as const;
  if (!target) {
    await page.screenshot(base);
    return;
  }
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${name}`);
  const size = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const x = Math.max(0, box.x - 260);
  const y = Math.max(0, box.y - 60);
  const right = Math.min(size.w, box.x + box.width + 8);
  const bottom = Math.min(size.h, box.y + Math.min(box.height, 360) + 8);
  await page.screenshot({
    ...base,
    clip: { x, y, width: right - x, height: bottom - y },
  });
}

async function attempt(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`[git-dock-preview] captured: ${name}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[git-dock-preview] NOT captured: ${name}: ${message}`);
  }
}

async function sizeMainWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(1360, 860);
    win.setPosition(0, 0);
  });
}

/** Captures one state in the two themes. The theme menu is in the main window. */
async function both(
  main: Page,
  name: string,
  capture: (mode: Mode) => Promise<void>,
): Promise<void> {
  for (const mode of MODES) {
    await setTheme(main, mode);
    await main.mouse.move(520, 520);
    await capture(mode);
  }
  console.log(`[git-dock-preview] captured: ${name}`);
}

async function detach(app: ElectronApplication, main: Page): Promise<Page> {
  const opened = app.waitForEvent('window', { timeout: 30_000 });
  await main.locator('[data-testid="git-dock-detach"]').click();
  const child = await opened;
  await child.waitForLoadState('domcontentloaded');
  return child;
}

test.describe('design preview: detachable Git dock', () => {
  test('repository with changes: docked, detached, rail, re-dock, empty', async ({
    electronApp,
    mainWindow: main,
    repo,
    ui,
  }) => {
    // More than one change group: staged, unstaged and untracked.
    repo.write('src/session-scope.ts', 'export const scope = "follow";\n');
    repo.git('add', 'src/session-scope.ts');
    repo.write('docs/notes.md', '# Notes\n\nDetach the Git dock.\n');

    await sizeMainWindow(electronApp);
    await ui.goto('git');
    const dock = main.locator('ptah-review-shell').first();
    await expect(dock).toBeVisible();
    await expect(main.locator('ptah-file-diff-section').first()).toBeVisible({
      timeout: 60_000,
    });
    const header = main.locator('[data-testid="git-dock-main-header"]');
    const rail = main.locator('[data-testid="detached-git-rail"]');

    // 1. Docked, with changes.
    await both(main, '01-docked', async (mode) => {
      await shoot(main, `${mode}-01-docked`);
      await shoot(main, `${mode}-01b-docked-header`, header);
    });
    await attempt('01c detach button keyboard focus', async () => {
      await both(main, '01c-detach-focus', async (mode) => {
        await main.locator('[data-testid="git-dock-detach"]').focus();
        await main.keyboard.press('Shift+Tab');
        await main.keyboard.press('Tab');
        await shoot(main, `${mode}-01c-detach-focus`, header);
      });
    });

    // 5b. Loading state of the child, then 2. the detached window.
    await setTheme(main, 'dark');
    let child = await detach(electronApp, main);
    await attempt('05b child first paint', () =>
      shoot(child, 'dark-05b-child-first-paint'),
    );
    await expect(child.locator('ptah-review-shell').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(rail).toBeVisible();
    await attempt('child diff sections', () =>
      expect(child.locator('ptah-file-diff-section').first()).toBeVisible({
        timeout: 30_000,
      }),
    );

    await both(main, '02-03-detached', async (mode) => {
      await child.waitForTimeout(800);
      await shoot(child, `${mode}-02-detached-window`);
      // 3. The main window while the dock is detached.
      await shoot(main, `${mode}-03-main-detached-rail`);
      await shoot(main, `${mode}-03b-rail-close-up`, rail);
    });
    await attempt('03c rail keyboard focus', async () => {
      await both(main, '03c-rail-focus', async (mode) => {
        await rail.getByRole('button', { name: 'Focus' }).focus();
        await main.keyboard.press('Tab');
        await shoot(main, `${mode}-03c-rail-focus-ring`, rail);
      });
    });

    // 5c. Error state in the detached window: Fetch with no remote.
    await attempt('05c child fetch error', async () => {
      await child.locator('[data-testid="git-fetch-button"]').click();
      await child.waitForTimeout(2_500);
      for (const mode of MODES) {
        await setTheme(main, mode);
        await child.waitForTimeout(500);
        await shoot(child, `${mode}-05c-detached-fetch-error`);
      }
    });

    // 4. Re-dock with the Attach button of the rail.
    const closed = child.waitForEvent('close', { timeout: 30_000 });
    await rail.getByRole('button', { name: 'Attach' }).click();
    await closed;
    await expect(dock).toBeVisible();
    await expect(rail).toHaveCount(0);
    await both(main, '04-redocked-attach', (mode) =>
      shoot(main, `${mode}-04-redocked-after-attach`),
    );

    // 4b. Re-dock when the user closes the Git window.
    await attempt('04b re-dock after window close', async () => {
      child = await detach(electronApp, main);
      await expect(child.locator('ptah-review-shell').first()).toBeVisible({
        timeout: 60_000,
      });
      await child.close();
      await expect(rail).toHaveCount(0, { timeout: 30_000 });
      await expect(dock).toBeVisible();
      await both(main, '04b-redocked-close', (mode) =>
        shoot(main, `${mode}-04b-redocked-after-window-close`),
      );
    });

    // 5a. Empty state: no changes. Docked, then detached.
    await attempt('05a no changes', async () => {
      repo.git('add', '-A');
      repo.git('commit', '-m', 'all changes');
      await expect(main.locator('ptah-file-diff-section')).toHaveCount(0, {
        timeout: 45_000,
      });
      await both(main, '05a-no-changes', (mode) =>
        shoot(main, `${mode}-05a-docked-no-changes`),
      );
      child = await detach(electronApp, main);
      await expect(child.locator('ptah-review-shell').first()).toBeVisible({
        timeout: 60_000,
      });
      await both(main, '05a-no-changes-detached', async (mode) => {
        await child.waitForTimeout(800);
        await shoot(child, `${mode}-05a-detached-no-changes`);
      });
    });
  });
});

const noRepoTest = test.extend({
  // eslint-disable-next-line no-empty-pattern
  repo: async ({}, use) => {
    const repo = createScratchRepo();
    repo.write('README.md', '# Not a repository\n');
    rmSync(join(repo.root, '.git'), { recursive: true, force: true });
    try {
      await use(repo);
    } finally {
      repo.cleanup();
    }
  },
});

noRepoTest.describe('design preview: detachable Git dock, no repository', () => {
  noRepoTest(
    'folder without a repository: docked and detached',
    async ({ electronApp, mainWindow: main, ui }) => {
      await sizeMainWindow(electronApp);
      await ui.goto('git');
      await expect(main.locator('ptah-review-shell').first()).toBeVisible();
      await main.waitForTimeout(3_000);
      await both(main, '06-no-repository', (mode) =>
        shoot(main, `${mode}-06-docked-no-repository`),
      );
      await attempt('06b no repository, detached', async () => {
        const child = await detach(electronApp, main);
        await child.waitForTimeout(4_000);
        await both(main, '06b-no-repository-detached', async (mode) => {
          await child.waitForTimeout(800);
          await shoot(child, `${mode}-06b-detached-no-repository`);
          await shoot(main, `${mode}-06c-main-no-repository-rail`);
        });
      });
    },
  );
});
