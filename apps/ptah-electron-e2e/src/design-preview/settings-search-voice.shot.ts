/**
 * Run from repository root:
 * node scripts/verify.mjs --exec --task shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts settings-search-voice.shot
 */
import { mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import type { CDPSession, Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { dynamicMocks, staticMocks } from './settings-search-voice.fixtures';

const OUT = resolve(
  __dirname, '../../../..',
  process.env['PTAH_SHOT_DIR'] ?? 'docs/design-system/settings/gate/search-voice',
);
const PHASE = process.env['PTAH_SHOT_PHASE'] ?? 'after';
const USERNAME = userInfo().username.toLowerCase();
type Clip = { x: number; y: number; width: number; height: number };

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function setMetrics(cdp: CDPSession, width: number, height: number): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
}

async function fitContent(page: Page, cdp: CDPSession, width: number): Promise<void> {
  await setMetrics(cdp, width, 1100);
  // The scroll container excludes the Electron title bar. Add its overflow to
  // the viewport height rather than treating scrollHeight as a window height.
  for (let pass = 0; pass < 4; pass++) {
    await settle(page);
    const size = await page.locator('.settings-page').evaluate((element) => {
      element.scrollTop = 0;
      return {
        height: window.innerHeight,
        overflow: element.scrollHeight - element.clientHeight,
      };
    });
    if (size.overflow <= 1) break;
    await setMetrics(cdp, width, size.height + size.overflow + 2);
  }
  await expect.poll(() => page.locator('.settings-page').evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  )).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
}

async function assertPrivacy(page: Page): Promise<void> {
  // Only sanitize the workspace readout, never conceal unrelated private text.
  await page.getByTestId('settings-context').evaluate((element, username) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.toLowerCase().includes(username)) {
        node.textContent = 'demo-workspace';
      }
    }
  }, USERNAME);
  const visibleText = await page.locator('body').innerText();
  // Boolean assertions keep a failed privacy gate from printing private text.
  expect(visibleText.toLowerCase().includes(USERNAME), 'Visible OS username').toBe(false);
  expect(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(visibleText), 'Visible email address').toBe(false);
}

async function capture(page: Page, image: string, clip?: Clip): Promise<void> {
  await settle(page);
  await assertPrivacy(page);
  const bytes = await page.screenshot({
    path: join(OUT, image), type: 'jpeg', quality: 70,
    animations: 'disabled', ...(clip ? { clip } : {}),
  });
  process.stdout.write(`${JSON.stringify({ image, size: bytes.length })}\n`);
}

async function clipAround(page: Page, locators: Locator[]): Promise<Clip> {
  const boxes = await Promise.all(locators.map(async (locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Capture target has no visible bounds');
    return box;
  }));
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const x = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x)) - 12));
  const y = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y)) - 12));
  const right = Math.min(viewport.width, Math.ceil(Math.max(...boxes.map((box) => box.x + box.width)) + 12));
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)) + 12));
  return { x, y, width: right - x, height: bottom - y };
}

async function captureStates(page: Page, cdp: CDPSession, width: number): Promise<void> {
  await page.getByTestId('settings-web-search-key-btn-serper').click();
  const input = page.getByTestId('settings-web-search-key-input');
  await expect(input).toBeVisible();
  const card = input.locator('xpath=ancestor::*[self::article or self::section or @data-glass-surface="content" or @ptahsurface][1]');
  await input.fill('');
  await fitContent(page, cdp, width);
  for (const state of ['empty', 'focus', 'value'] as const) {
    if (state === 'empty') await input.evaluate((element) => element.blur());
    if (state === 'focus') await input.focus();
    if (state === 'value') {
      await expect(input).toHaveAttribute('type', 'password');
      await input.fill('demo-key-0000');
    }
    await capture(page, `search-key-field-${state}-dark-${width}.jpg`, await clipAround(page, [card]));
  }
  // Cancel the draft so it cannot affect later page or select images.
  await input.press('Escape');
  await expect(input).toBeHidden();
  await fitContent(page, cdp, width);

  const trigger = page.getByTestId('voice-provider-btn-stt').locator('button[role="combobox"]');
  const voice = trigger.locator('xpath=ancestor::section[1]');
  await trigger.click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await capture(page, `search-select-open-dark-${width}.jpg`, await clipAround(page, [voice, menu]));
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await trigger.evaluate((element) => element.blur());
  await capture(page, `search-select-rest-dark-${width}.jpg`, await clipAround(page, [voice]));
  // Tab back from the following focus stop to exercise :focus-visible.
  await trigger.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await capture(page, `search-select-focus-dark-${width}.jpg`, await clipAround(page, [voice]));
  await trigger.evaluate((element) => element.blur());
}

test('captures populated Search & Voice and optional control states', async ({
  ui, electronApp, mainWindow: page,
}) => {
  await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
  await ui.prepare({
    initialView: 'chat', workspaceRoot: 'D:\\work\\demo-workspace',
    workspaceName: 'demo-workspace',
  });
  await ui.goto('settings');
  await page.getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Search & Voice', exact: true }).click();
  await expect(page.getByTestId('settings-web-search-key-status-tavily')).toBeVisible();
  await expect(page.getByTestId('voice-engine-status-tts')).toBeVisible();
  await expect(page.getByTestId('voice-engine-model-tts')).toHaveText('Sarah');
  await expect(page.getByTestId('go-vet-consent-state')).toBeVisible();

  mkdirSync(OUT, { recursive: true });
  const window = await electronApp.browserWindow(page);
  const originalSize = await window.evaluate((win) => win.getContentSize());
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const theme of ['dark', 'light'] as const) {
      await page.getByRole('button', { name: 'Change theme' }).click();
      // The Ptah Glass themes sit in the "Glass" category of the theme picker.
      await page.getByRole('tab', { name: 'Glass', exact: true }).click();
      await page
        .getByRole('button', { name: theme === 'dark' ? 'Ptah Glass' : 'Ptah Glass Light', exact: true })
        .first()
        .click();
      await page.keyboard.press('Escape');
      await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
      for (const width of [1824, 1168, 784]) {
        try {
          await window.evaluate((win, size) => win.setContentSize(size, 1100), width);
          await fitContent(page, cdp, width);
          await capture(page, `search-${theme}-${width}-${PHASE}.jpg`);
          if (process.env['PTAH_SHOT_STATES'] === '1' && theme === 'dark' && width !== 1168) {
            await captureStates(page, cdp, width);
          }
        } finally {
          await cdp.send('Emulation.clearDeviceMetricsOverride');
        }
      }
    }
    // No-regression evidence for the shared setting-row change on a different Settings page.
    if (process.env['PTAH_SHOT_ADVANCED'] === '1') {
      await page.getByRole('navigation', { name: 'Settings sections' })
        .getByRole('button', { name: 'Advanced', exact: true }).click();
      await window.evaluate((win, size) => win.setContentSize(size, 1100), 784);
      await fitContent(page, cdp, 784);
      await capture(page, `advanced-light-784-${PHASE}.jpg`);
    }
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
    await window.evaluate((win, size) => win.setContentSize(size[0], size[1]), originalSize);
  }
});
