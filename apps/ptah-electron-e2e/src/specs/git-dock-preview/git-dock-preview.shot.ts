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
 * The Git window follows a theme change of the main window at run time (frame
 * 02x). Each detached state still opens a new Git window for each theme, so
 * that each frame starts from the same state.
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
  await page.mouse.move(520, 520);
}

async function shoot(
  page: Page,
  name: string,
  target?: Locator,
): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.jpg`);
  const base = {
    path,
    type: 'jpeg',
    quality: 60,
    animations: 'disabled',
  } as const;
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

/** Main window capture, cropped to the dock column (nav bar included). */
async function shootDock(main: Page, name: string): Promise<void> {
  const box = await main.locator('.electron-git-dock').first().boundingBox();
  if (!box) throw new Error(`no dock box for ${name}`);
  const size = await main.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const x = Math.max(0, box.x - 24);
  mkdirSync(OUT, { recursive: true });
  await main.screenshot({
    path: join(OUT, `${name}.jpg`),
    type: 'jpeg',
    quality: 60,
    animations: 'disabled',
    clip: { x, y: 0, width: size.w - x, height: size.h },
  });
}

/** Captures one state of the main window in the two themes. */
async function both(
  main: Page,
  capture: (mode: Mode) => Promise<void>,
): Promise<void> {
  for (const mode of MODES) {
    await setTheme(main, mode);
    await capture(mode);
  }
}

const rail = (main: Page): Locator =>
  main.locator('[data-testid="detached-git-rail"]');

async function detach(app: ElectronApplication, main: Page): Promise<Page> {
  const opened = app.waitForEvent('window', { timeout: 30_000 });
  await main.locator('[data-testid="git-dock-detach"]').click();
  const child = await opened;
  await child.waitForLoadState('domcontentloaded');
  return child;
}

/** Sets the Git window (the window with the 720 px minimum) to a content width. */
async function sizeGitWindow(
  app: ElectronApplication,
  width: number,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.getMinimumSize()[0] === 720,
    );
    if (!win) throw new Error("no Git window");
    const [, height] = win.getSize();
    win.setSize(w, height);
  }, width);
}

async function ready(child: Page): Promise<void> {
  await expect(child.locator('ptah-review-shell').first()).toBeVisible({
    timeout: 60_000,
  });
  await child.waitForTimeout(1_500);
}

/** Re-dock with the Attach button of the rail in the main window. */
async function attach(main: Page, child: Page): Promise<void> {
  const closed = child.waitForEvent('close', { timeout: 30_000 });
  await rail(main).getByRole('button', { name: 'Attach' }).click();
  await closed;
  await expect(rail(main)).toHaveCount(0);
  await expect(main.locator('ptah-review-shell').first()).toBeVisible();
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

    // 1. Docked, with changes.
    await both(main, async (mode) => {
      await shoot(main, `${mode}-01-docked`);
      await shoot(main, `${mode}-01b-docked-header`, header);
      await attempt(`${mode} 01c detach button keyboard focus`, async () => {
        await main.locator('[data-testid="git-dock-detach"]').focus();
        await main.keyboard.press('Shift+Tab');
        await main.keyboard.press('Tab');
        await shoot(main, `${mode}-01c-detach-focus`, header);
      });
    });

    // 2 and 3. Detached window and the main window with the rail, then
    // 5c. an error state in the Git window, then 4. re-dock with Attach.
    for (const mode of MODES) {
      await setTheme(main, mode);
      const child = await detach(electronApp, main);
      if (mode === 'dark') {
        await attempt('05b child first paint', () =>
          shoot(child, 'dark-05b-child-first-paint'),
        );
      }
      await ready(child);
      await expect(rail(main)).toBeVisible();
      await attempt(`${mode} child diff sections`, () =>
        expect(child.locator('ptah-file-diff-section').first()).toBeVisible({
          timeout: 30_000,
        }),
      );
      await shoot(child, `${mode}-02-detached-window`);
      await attempt(`${mode} 02m minimum width`, async () => {
        // A width below the minimum: the host keeps the window at 720 px.
        await sizeGitWindow(electronApp, 400);
        await child.waitForTimeout(1_000);
        await shoot(child, `${mode}-02m-detached-min-width`);
      });
      await shoot(main, `${mode}-03-main-detached-rail`);
      await shoot(main, `${mode}-03b-rail-close-up`, rail(main));
      await attempt(`${mode} 03c rail keyboard focus`, async () => {
        await rail(main).getByRole('button', { name: 'Focus' }).focus();
        await main.keyboard.press('Tab');
        await shoot(main, `${mode}-03c-rail-focus-ring`, rail(main));
        await main.mouse.click(520, 520);
      });
      await attempt(`${mode} 05c child pull error`, async () => {
        // The scratch repository has no remote: Pull fails.
        await child.locator('[data-testid="git-pull-button"]').click();
        await child.waitForTimeout(4_000);
        await shoot(child, `${mode}-05c-detached-pull-error`);
      });
      await attach(main, child);
      await main.mouse.move(520, 520);
      await shootDock(main, `${mode}-04-redocked-after-attach`);
    }

    // 2x. The Git window opened in dark, then the main window changed to light.
    await attempt('02x theme followed at run time', async () => {
      await setTheme(main, 'dark');
      const child = await detach(electronApp, main);
      await ready(child);
      await setTheme(main, 'light');
      await expect(child.locator('html')).toHaveAttribute(
        'data-theme',
        'ptah-glass-light',
      );
      await child.waitForTimeout(1_500);
      await shoot(child, 'light-02x-detached-theme-followed');
      // 4b. Re-dock when the user closes the Git window.
      await child.close();
      await expect(rail(main)).toHaveCount(0, { timeout: 30_000 });
      await expect(dock).toBeVisible();
      await both(main, (m) =>
        shootDock(main, `${m}-04b-redocked-after-window-close`),
      );
    });

    // 5a. Empty state: no changes. Docked, then detached.
    await attempt('05a no changes', async () => {
      repo.git('add', '-A');
      repo.git('commit', '-m', 'all changes');
      await expect(main.locator('ptah-file-diff-section')).toHaveCount(0, {
        timeout: 45_000,
      });
      for (const mode of MODES) {
        await setTheme(main, mode);
        await shootDock(main, `${mode}-05a-docked-no-changes`);
        const child = await detach(electronApp, main);
        await ready(child);
        await shoot(child, `${mode}-05a-detached-no-changes`);
        await attach(main, child);
      }
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
      for (const mode of MODES) {
        await setTheme(main, mode);
        // With no repository the dock shows no Detach button, so there is no
        // detached frame of this state.
        await expect(
          main.locator('[data-testid="git-dock-detach"]'),
        ).toHaveCount(0);
        await shootDock(main, `${mode}-06-docked-no-repository`);
      }
    },
  );
});
