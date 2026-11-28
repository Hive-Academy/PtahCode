/** Populated Advanced visual gate. The coordinator runs this Electron spec. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { dynamicMocks, staticMocks, WORKSPACE } from './settings-advanced.fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(ROOT, process.env['PTAH_SHOT_DIR'] ?? '.ptah/tmp/advanced-shots');
const PHASE = process.env['PTAH_SHOT_PHASE'] ?? 'after';
const HEIGHT = 1100;
const jpeg = { type: 'jpeg', quality: 72, scale: 'css', animations: 'disabled' } as const;

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  if ((await page.locator('html').getAttribute('data-theme-mode')) !== theme) {
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('tab', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
    if ((await page.locator('html').getAttribute('data-theme-mode')) !== theme) {
      const glass = page.getByRole('button', { name: 'Ptah Glass', exact: true }).first();
      await (await glass.isVisible() ? glass : page.locator('button.theme-tile:visible').first()).click();
    }
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
}

async function blur(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function shoot(page: Page, target: Locator, name: string): Promise<void> {
  await settled(page);
  await target.screenshot({ ...jpeg, path: join(OUT, `${name}-${PHASE}.jpg`) });
}

/** Element shot with a margin, so a floated label above the box border is not cut. */
async function shootPadded(page: Page, target: Locator, name: string, pad = 12, include?: Locator): Promise<void> {
  await settled(page);
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing bounds for ${name}`);
  const extra = await include?.boundingBox();
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const x = Math.max(0, Math.min(box.x, extra?.x ?? box.x) - pad);
  const y = Math.max(0, Math.min(box.y, extra?.y ?? box.y) - pad);
  const right = Math.min(viewport.width, Math.max(box.x + box.width, extra ? extra.x + extra.width : 0) + pad);
  const bottom = Math.min(viewport.height, Math.max(box.y + box.height, extra ? extra.y + extra.height : 0) + pad);
  await page.screenshot({
    ...jpeg,
    path: join(OUT, `${name}-${PHASE}.jpg`),
    clip: { x, y, width: right - x, height: bottom - y },
  });
}

async function fieldStates(page: Page, field: Locator, target: Locator, prefix: string, theme: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const value = await field.inputValue();
  await blur(page);
  await shoot(page, target, `${prefix}-rest-${theme}-1824`);
  await field.focus();
  await shoot(page, target, `${prefix}-focus-${theme}-1824`);
  await field.fill('');
  await blur(page);
  await expect(field).toHaveValue('');
  await shoot(page, target, `${prefix}-empty-${theme}-1824`);
  await field.fill(value);
  await blur(page);
  await expect(field).toHaveValue(value);
}

test('captures populated Advanced settings and control states', async ({ ui, mainWindow: page }) => {
  test.setTimeout(180_000);
  expect(['before', 'after']).toContain(PHASE);
  mkdirSync(OUT, { recursive: true });
  await ui.mockRpc({ ...staticMocks, ...dynamicMocks });
  await ui.prepare({ initialView: 'settings', workspaceRoot: WORKSPACE, workspaceName: 'demo-workspace' });
  await ui.goto('settings');
  await page.getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Advanced', exact: true }).click();

  for (const selector of ['ptah-agent-behaviour-section', 'ptah-output-style-config', 'ptah-mcp-port-config', 'ptah-claude-builtins-config']) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await expect(page.getByTestId('mcp-port-input')).toHaveValue('51820');
  await expect(page.locator('ptah-output-style-config')).toContainText('Team concise');
  const details = page.getByTestId('fine-tuning-details');
  const rows = details.locator('[data-testid^="fine-tuning-row-"]');
  await expect(rows).toHaveCount(3);
  const memoryRow = rows.filter({ has: page.getByRole('button', { name: /Memory upkeep/ }) });
  const memoryToggle = memoryRow.locator('button[aria-expanded]').first();
  const numberGroup = memoryRow.locator('ptah-advanced-settings-group');
  const number = numberGroup.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first();
  const infoField = numberGroup.locator('ptah-field').nth(1);
  const info = infoField.getByRole('button', { name: /^More about / });
  const help = infoField.locator('[role="dialog"]');

  const scroll = page.locator('.settings-page');
  const mcp = page.locator('ptah-mcp-port-config');
  const port = page.getByTestId('mcp-port-input');
  const metrics: { theme: string; width: number; pageWidth: number; mcpPortWidth: number; fineTuningNumberWidth: number | null; captureHeight: number; capped: boolean }[] = [];
  const cdp = await page.context().newCDPSession(page);
  const resize = async (width: number, height = HEIGHT): Promise<void> => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await settled(page);
  };
  try {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      for (const row of await rows.all()) {
        await expect(row.locator('button[aria-expanded]').first()).toHaveAttribute('aria-expanded', 'false');
        await expect(row).toContainText(/\d+ settings/);
      }
      for (const width of [1824, 1168, 784]) {
        await resize(width);
        // Include the fixed shell/header space as well as the inner scroll content.
        const desiredHeight = await scroll.evaluate((element) => Math.ceil(element.scrollHeight + window.innerHeight - element.clientHeight));
        const captureHeight = Math.min(6000, Math.max(HEIGHT, desiredHeight));
        metrics.push({
          theme, width, pageWidth: await page.evaluate(() => window.innerWidth),
          mcpPortWidth: await port.evaluate((element) => element.getBoundingClientRect().width),
          fineTuningNumberWidth: null, // Default-closed groups have no visible numeric controls.
          captureHeight, capped: desiredHeight > 6000,
        });
        try {
          await resize(width, captureHeight);
          await scroll.evaluate((element) => { element.scrollTop = 0; });
          await blur(page);
          await settled(page);
          await page.screenshot({ ...jpeg, path: join(OUT, `advanced-${theme}-${width}-${PHASE}.jpg`) });
        } finally {
          await resize(width);
        }
      }
      await resize(1824);
      await fieldStates(page, port, mcp, 'advanced-controls', theme);
      await memoryToggle.click();
      await expect(memoryToggle).toHaveAttribute('aria-expanded', 'true');
      await numberGroup.scrollIntoViewIfNeeded();
      await expect(number).toBeVisible();
      await expect(number).not.toHaveValue('');
      await fieldStates(page, number, numberGroup, 'advanced-number', theme);

      // Only Memory upkeep is open; other group counts stay visible.
      await details.scrollIntoViewIfNeeded();
      await blur(page);
      await shootPadded(page, details, `advanced-fine-tuning-open-${theme}-1824`);
      for (const width of [1824, 784]) {
        await resize(width);
        // The second numeric field occupies the middle column at 1824.
        await infoField.scrollIntoViewIfNeeded();
        await blur(page);
        await expect(info).toBeVisible();
        await expect(info).toHaveAttribute('aria-expanded', 'false');
        await shootPadded(page, infoField, `advanced-field-info-rest-${theme}-${width}`);
        await info.click();
        await expect(help).toBeVisible();
        await shootPadded(page, infoField, `advanced-field-info-open-${theme}-${width}`, 12, help);
        // The shot helper can move focus; Escape closes from the trigger.
        await info.press('Escape');
        await expect(help).not.toBeVisible();
        await expect(info).toHaveAttribute('aria-expanded', 'false');
      }
      await memoryToggle.click();
      await expect(memoryToggle).toHaveAttribute('aria-expanded', 'false');
      await resize(1824);

      await mcp.scrollIntoViewIfNeeded();
      const caller = page.getByTestId('mcp-external-caller-access');
      const native = await caller.evaluate((element) => element.tagName === 'SELECT');
      // A rich select host has no box of its own: click its trigger button.
      await (native ? caller : page.locator('#mcp-external-caller-access')).click();
      if (native) {
        await page.keyboard.press('Escape');
        await blur(page);
        await shoot(page, mcp, `advanced-controls-menu-native-${theme}-1824`);
      } else {
        // Select menus are portalled, so include their bounds with the section.
        const menu = page.locator('[role="listbox"]:visible, [role="menu"]:visible').last();
        await expect(menu).toBeVisible();
        await settled(page);
        const sectionBox = await mcp.boundingBox();
        const menuBox = await menu.boundingBox();
        expect(sectionBox).not.toBeNull();
        expect(menuBox).not.toBeNull();
        if (!sectionBox || !menuBox) throw new Error('Missing MCP section or open menu bounds');
        const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        const x = Math.max(0, Math.min(sectionBox.x, menuBox.x));
        const y = Math.max(0, Math.min(sectionBox.y, menuBox.y));
        const right = Math.min(viewport.width, Math.max(sectionBox.x + sectionBox.width, menuBox.x + menuBox.width));
        const bottom = Math.min(viewport.height, Math.max(sectionBox.y + sectionBox.height, menuBox.y + menuBox.height));
        await page.screenshot({ ...jpeg, path: join(OUT, `advanced-controls-menu-${theme}-1824-${PHASE}.jpg`), clip: { x, y, width: right - x, height: bottom - y } });
        await page.keyboard.press('Escape');
      }
    }
    writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

    // Null default ('Model default'): the context-budgets group of the same group component is
    // on the Context management page. Empty at rest; on focus the label floats and the
    // placeholder shows, so label and placeholder never overlap.
    await resize(1824);
    await page.getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: /context management/i }).click();
    const modelDefault = page.getByTestId('advanced-setting-compaction.threshold');
    const modelDefaultField = page.getByTestId('advanced-setting-compaction.threshold-field');
    for (let tries = 0; tries < 8 && (await modelDefault.count()) === 0; tries += 1) {
      await scroll.evaluate((element) => { element.scrollTop += element.clientHeight; });
      await settled(page);
    }
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await modelDefaultField.scrollIntoViewIfNeeded();
      await expect(modelDefault).toHaveValue('');
      await expect(modelDefault).toHaveAttribute('placeholder', 'Model default');
      await blur(page);
      await shootPadded(page, modelDefaultField, `advanced-model-default-rest-${theme}-1824`);
      await modelDefault.focus();
      await shootPadded(page, modelDefaultField, `advanced-model-default-focus-${theme}-1824`);
      await blur(page);
    }
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
  }
});
