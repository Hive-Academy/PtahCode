import { test, expect } from '../docs-screenshots/_harness/docs-fixtures';
import type { Page } from '@playwright/test';
import * as path from 'path';

// Fixed folder name keeps the workspace header and any breadcrumbs stable.
test.use({ workspace: path.resolve(__dirname, '../../../../.ptah/specs/TASK_2026_904/wave1/visual/sample-repo') });

type Theme = 'dark' | 'light';

async function settle(page: Page, theme: Theme, glass: boolean, park: { x: number; y: number } | null): Promise<void> {
  await page.evaluate(({ theme, glass }) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', glass ? (theme === 'dark' ? 'ptah-glass' : 'ptah-glass-light') : (theme === 'dark' ? 'anubis' : 'anubis-light'));
    root.setAttribute('data-theme-mode', theme);
    root.setAttribute('data-glass-effects', glass ? 'on' : 'off');
    if (glass) {
      root.setAttribute('data-glass', 'on');
      root.setAttribute('data-glass-mode', theme);
    } else {
      root.removeAttribute('data-glass');
      root.removeAttribute('data-glass-mode');
    }
  }, { theme, glass });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
  await page.evaluate(() => document.fonts.ready);
  if (park) await page.mouse.move(park.x, park.y);
  await page.waitForTimeout(500);
}

async function shot(page: Page, name: string, theme: Theme, glass = true, parkPointer = true): Promise<void> {
  // The review drawer covers the right edge: park on the backdrop so no drawer scrollbar gets a hover state.
  const park = name === 'review-settings-before' ? { x: 300, y: 990 } : { x: 1590, y: 990 };
  await settle(page, theme, glass, parkPointer ? park : null);
  const target = name === 'ready-workspace' ? page.getByTestId('workspace-header')
    : name.startsWith('chat-rail-') ? page.locator('ptah-canvas-rail aside > header')
    : name === 'review-settings-before' ? page.getByRole('dialog', { name: 'Review settings' })
    : page;
  await expect(target).toHaveScreenshot(`${name}-${theme}-${glass ? 'glass' : 'solid'}.png`, {
    maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'css',
  });
}

test('onboarding analysis ready and workspace header', async ({ ui, page }) => {
  await ui.goto('onboarding');
  const home = page.locator('ptah-onboarding-home');
  await expect(home).toBeVisible();
  await page.getByTestId('onboarding-path-link-analyze').click();
  await expect(page.getByTestId('analyze-workspace')).toBeVisible();
  for (const theme of ['dark', 'light'] as const) {
    await shot(page, 'analyze-ready', theme, true);
    await shot(page, 'analyze-ready', theme, false);
  }
  await ui.goto('onboarding');
  await page.getByTestId('onboarding-review-ready').click();
  await expect(page.getByTestId('workspace-header')).toBeVisible();
  for (const theme of ['dark', 'light'] as const) await shot(page, 'ready-workspace', theme);
});

test('chat canvas rail', async ({ ui, page }) => {
  await ui.goto('chat');
  const toggle = page.getByTestId('rail-collapse-toggle');
  await expect(toggle).toBeVisible();
  for (const theme of ['dark', 'light'] as const) {
    await shot(page, 'chat-rail-expanded', theme);
    const icon = page.getByRole('button', { name: 'Dense cards' });
    await icon.hover();
    await shot(page, 'chat-rail-hover', theme, true, false);
    // A keyboard round trip activates :focus-visible; focus() after hover does not.
    await icon.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(icon).toBeFocused();
    await shot(page, 'chat-rail-focus', theme);
    await toggle.click();
    await shot(page, 'chat-rail-collapsed', theme);
    await toggle.click();
  }
});

test('consumer surfaces before extraction', async ({ ui, page }) => {
  await ui.goto('chat');
  // Workspace activation can race a single switchView push. Repeat until the
  // Electron-only routed host mounts, as UiDriver.goto does for known views.
  for (let attempt = 0; attempt < 15 && !(await page.locator('ptah-machines-view').count()); attempt++) {
    await ui.pushEvent({ type: 'switchView', payload: { view: 'machines' } });
    await page.waitForTimeout(500);
  }
  await expect(page.locator('ptah-machines-view')).toBeVisible();
  await expect(page.getByTestId('machines-view')).toBeVisible();
  await page.getByTestId('machines-empty-add').click();
  await expect(page.locator('ptah-add-machine-pane')).toBeVisible();
  for (const theme of ['dark', 'light'] as const) await shot(page, 'machines-add-before', theme);
  await ui.goto('review-runs');
  await page.getByRole('button', { name: 'Review settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Review settings' })).toBeVisible();
  for (const theme of ['dark', 'light'] as const) await shot(page, 'review-settings-before', theme);
});
