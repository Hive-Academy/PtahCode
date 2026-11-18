/**
 * Field info gate (Context Management session budget + lane guards, Search & Voice drawers).
 * Run from repository root:
 * npm run verify -- --exec --task shots -- npx playwright test --config apps/ptah-electron-e2e/design-preview.config.ts settings-field-info.shot
 * Env: PTAH_SHOT_DIR (default .ptah/tmp/field-info-shots), PTAH_SHOT_PHASE (before | after).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import type { CDPSession, Locator, Page } from '@playwright/test';
import { ADVANCED_SETTINGS, SESSION_BUDGET_SETTINGS } from '@ptah-extension/shared';
import { test, expect } from '../support/fixtures';
import * as advanced from './settings-advanced.fixtures';
import * as searchVoice from './settings-search-voice.fixtures';

const ROOT = resolve(__dirname, '../../../..');
const OUT = resolve(ROOT, process.env['PTAH_SHOT_DIR'] ?? '.ptah/tmp/field-info-shots');
const PHASE = process.env['PTAH_SHOT_PHASE'] ?? 'after';
const USERNAME = userInfo().username.toLowerCase();
const WIDTHS = [1824, 1168, 784] as const;
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];
type Clip = { x: number; y: number; width: number; height: number };

/** Valid stored values for every Context Management setting (no "saved value is not valid" notice). */
const contextSettings: Record<string, unknown> = {
  ...Object.fromEntries(ADVANCED_SETTINGS.map((setting) => [setting.key, setting.default])),
  ...Object.fromEntries(Object.values(SESSION_BUDGET_SETTINGS).map((setting) => [setting.key, setting.default])),
};
const contextMocks = {
  'settings:get': `(params) => ({ success: true, value: (${JSON.stringify(contextSettings)})[params.key] ?? null })`,
};

/** Local STT and local TTS, so both drawers show the local panels. */
const voiceMocks = {
  ...searchVoice.staticMocks,
  'voice:listProviders': {
    ...searchVoice.staticMocks['voice:listProviders'],
    active: { stt: 'local', tts: 'local' },
  },
  'voice:getProviderConfig': {
    ok: true,
    config: {
      ...searchVoice.staticMocks['voice:getProviderConfig'].config,
      ttsProvider: 'local',
    },
  },
} as const;

async function settle(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}

async function blur(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('tab', { name: 'Glass', exact: true }).click();
  await page.getByRole('button', { name: theme === 'dark' ? 'Ptah Glass' : 'Ptah Glass Light', exact: true })
    .first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme);
}

async function assertPrivacy(page: Page): Promise<void> {
  const text = (await page.locator('body').innerText()).toLowerCase();
  // Boolean assertions keep a failed privacy gate from printing private text.
  expect(text.includes(USERNAME), 'Visible OS username').toBe(false);
  expect(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text), 'Visible email address').toBe(false);
}

async function clipAround(page: Page, locators: Locator[], pad = 12): Promise<Clip> {
  const boxes = await Promise.all(locators.map(async (locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Capture target has no visible bounds');
    return box;
  }));
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const x = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x)) - pad));
  const y = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y)) - pad));
  const right = Math.min(viewport.width, Math.ceil(Math.max(...boxes.map((box) => box.x + box.width)) + pad));
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)) + pad));
  return { x, y, width: right - x, height: bottom - y };
}

async function capture(page: Page, image: string, clip: Clip): Promise<void> {
  await settle(page);
  await assertPrivacy(page);
  const bytes = await page.screenshot({
    path: join(OUT, image), type: 'jpeg', quality: 70, animations: 'disabled', clip,
  });
  process.stdout.write(`${JSON.stringify({ image, size: bytes.length })}\n`);
}

/** Viewport tall enough for the scroll content, so one shot holds both sections. */
async function fit(page: Page, cdp: CDPSession, width: number): Promise<void> {
  const scroll = page.locator('.settings-page');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
  await settle(page);
  const height = await scroll.evaluate((element) =>
    Math.min(6000, Math.ceil(element.scrollHeight + window.innerHeight - element.clientHeight)));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.max(1100, height), deviceScaleFactor: 1, mobile: false });
  await settle(page);
  await scroll.evaluate((element) => { element.scrollTop = 0; });
}

/** Lines of a rendered text element (height over line height). */
async function lineCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4;
    return Math.round(element.getBoundingClientRect().height / line);
  });
}

/** Measure actual text, including placeholders which do not contribute to scrollWidth. */
async function assertUncutFields(scope: Locator): Promise<void> {
  const clipped = await scope.evaluate((root) => {
    const failures: string[] = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Text measurement unavailable');
    for (const node of root.querySelectorAll<HTMLElement>('.ptah-field__label, .ptah-select__value, input[placeholder]')) {
      if (!node.getClientRects().length) continue;
      const style = getComputedStyle(node);
      const name = `${node.id || node.className} "${(node instanceof HTMLInputElement ? node.placeholder : node.textContent ?? '').trim()}" @${innerWidth}`;
      if (node instanceof HTMLInputElement) {
        const placeholder = node.placeholder;
        context.font = style.font;
        const spacing = Number.parseFloat(style.letterSpacing) || 0;
        const available = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (context.measureText(placeholder).width + spacing * Math.max(0, placeholder.length - 1) > available + 1) {
          failures.push(`${name}: placeholder exceeds content width`);
        }
      } else if (node.scrollWidth > node.clientWidth) {
        failures.push(`${name}: ${style.textOverflow} (${node.scrollWidth} > ${node.clientWidth})`);
      }
    }
    return failures;
  });
  expect(clipped, 'Clipped labels, selected values or placeholders').toEqual([]);
}

/** Compare the visible bottom of each field block with the next row's notch label. */
async function assertBudgetRowGaps(budget: Locator): Promise<void> {
  const gaps = await budget.evaluate((root) => {
    const rows: { top: number; bottom: number; labelTop: number }[] = [];
    const parts = [...root.querySelectorAll<HTMLElement>('.session-budget-grid > ptah-field')].map((field) => {
      const boxNode = field.querySelector('.ptah-field__box');
      const labelNode = field.querySelector('.ptah-field__label');
      const messageNode = field.querySelector('.ptah-field__message');
      if (!boxNode || !labelNode || !messageNode) throw new Error('Budget field lacks box, label or hint');
      return {
        box: boxNode.getBoundingClientRect(),
        label: labelNode.getBoundingClientRect(),
        message: messageNode.getBoundingClientRect(),
      };
    });
    // An empty input keeps its label inside the box (not floated): use the notch offset of a floated label.
    const floated = parts.find((part) => part.label.top < part.box.top);
    if (!floated) throw new Error('No floated budget label to measure the notch offset');
    const notchOffset = floated.box.top - floated.label.top;
    for (const { box, message, ...part } of parts) {
      const label = { top: part.label.top < box.top ? part.label.top : box.top - notchOffset };
      const row = rows.find((row) => Math.abs(row.top - box.top) < 2);
      const bottom = Math.max(box.bottom, message.bottom);
      if (row) {
        row.bottom = Math.max(row.bottom, bottom);
        row.labelTop = Math.min(row.labelTop, label.top);
      } else rows.push({ top: box.top, bottom, labelTop: label.top });
    }
    rows.sort((a, b) => a.top - b.top);
    return rows.slice(1).map((row, i) => row.labelTop - rows[i].bottom);
  });
  expect(gaps.length, 'At least two row gaps measured').toBeGreaterThan(1);
  expect(Math.min(...gaps), 'Hints must clear the next floating label').toBeGreaterThan(0);
  expect(Math.max(...gaps) - Math.min(...gaps), `Unequal field row gaps: ${gaps.join(', ')}`).toBeLessThanOrEqual(2);
  for (const hint of await budget.locator('.session-budget-grid .ptah-field__message').all()) {
    expect(await lineCount(hint), 'One-line budget hint').toBe(1);
  }
}

/**
 * Opens a select, and checks that the lowest option is the top element at its centre
 * (a glass section painted above the panel fails this). Closes the panel again.
 */
async function lowestOptionOnTop(page: Page, trigger: Locator): Promise<string> {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const option = page.getByRole('listbox').getByRole('option').last();
  await expect(option).toBeVisible();
  // A long list scrolls inside its panel: bring the option into view, as a click does.
  await option.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
  await settle(page);
  const onTop = await option.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit && (hit === element || element.contains(hit))) return 'on-top';
    const host = hit?.closest('[data-testid]');
    return `covered-by:${hit?.tagName.toLowerCase() ?? 'none'}:${host?.getAttribute('data-testid') ?? ''}`;
  });
  // Escape from the focused trigger closes only the panel, also inside a drawer.
  await trigger.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  return onTop;
}

/**
 * Opens the info popover of a field and asserts that it is on top of the neighbour fields
 * (hit test at five inset points), inside the viewport, and that its text is not cut.
 * Returns the open panel. The caller closes it.
 */
async function openInfo(page: Page, field: Locator): Promise<Locator> {
  const trigger = field.getByRole('button', { name: /^More about / });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const panel = field.locator('[role="dialog"]');
  await expect(panel).toBeVisible();
  await settle(page);
  const check = await panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const inset = 6;
    const points = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + inset, box.top + inset], [box.right - inset, box.top + inset],
      [box.left + inset, box.bottom - inset], [box.right - inset, box.bottom - inset],
    ];
    const onTop = points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === element || element.contains(hit));
    });
    const inside = box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    const notCut = element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
    return { onTop, inside, notCut };
  });
  expect(check, 'Info popover on top, inside the viewport, text not cut').toEqual({ onTop: true, inside: true, notCut: true });
  return panel;
}

test('captures field info hints on Context Management and the voice drawers', async ({ ui, mainWindow: page }) => {
  test.setTimeout(300_000);
  expect(['before', 'after']).toContain(PHASE);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown> = { phase: PHASE };
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  const cdp = await page.context().newCDPSession(page);
  try {
    // Context Management: session budget + lane guards.
    await ui.mockRpc({ ...advanced.staticMocks, ...advanced.dynamicMocks, ...contextMocks });
    await ui.prepare({ initialView: 'settings', workspaceRoot: advanced.WORKSPACE, workspaceName: 'demo-workspace' });
    await ui.goto('settings');
    await nav.getByRole('button', { name: /context management/i }).click();
    const budget = page.getByTestId('settings-section-session-budget');
    const guards = page.getByTestId('settings-section-lane-guards');
    await expect(page.getByTestId('session-budget-tokens')).toBeVisible();
    await expect(page.getByTestId('lane-guards-repeat')).toBeVisible();
    for (const theme of THEMES) {
      await setTheme(page, theme);
      for (const width of WIDTHS) {
        await fit(page, cdp, width);
        await blur(page);
        if (PHASE === 'after') {
          await assertUncutFields(budget);
          await assertBudgetRowGaps(budget);
        }
        await capture(page, `context-fields-${theme}-${width}-${PHASE}.jpg`, await clipAround(page, [budget, guards]));
        if (width === 1168 && theme === 'dark') {
          metrics['autoHandoffHintLines1168'] = await lineCount(page.locator('#session-budget-autoHandoffAtLimit-hint'));
        }
      }
    }
    // Open info popovers (after only): a session budget field and the lane guard field.
    const fieldOf = (testId: string): Locator =>
      page.locator('ptah-field').filter({ has: page.getByTestId(testId) });
    const tokensField = fieldOf('session-budget-handoffAfterCompactions');
    const guardField = fieldOf('lane-guards-repeat');
    metrics['budgetLongHelpInfo'] = (await tokensField.getByRole('button', { name: /^More about / }).count()) > 0;
    if (metrics['budgetLongHelpInfo']) {
      await setTheme(page, 'dark');
      for (const width of WIDTHS) {
        await fit(page, cdp, width);
        for (const [name, field, section] of [['budget', tokensField, budget], ['guards', guardField, guards]] as const) {
          const panel = await openInfo(page, field);
          await capture(page, `context-info-${name}-open-dark-${width}-${PHASE}.jpg`, await clipAround(page, [section, panel]));
          await page.keyboard.press('Escape');
          await expect(panel).not.toBeVisible();
        }
      }
    }

    // Decision matrix: the Routing suggestions toggle description at 1168 px.
    await nav.getByRole('button', { name: /decision matrix/i }).click();
    const routingHint = page.getByText('Suggestions appear before a lane starts.', { exact: false }).first();
    await expect(routingHint).toBeVisible();
    await fit(page, cdp, 1168);
    metrics['routingHintLines1168'] = await lineCount(routingHint);

    // Search & Voice: select stacking and the local STT / TTS drawers.
    await ui.mockRpc({ ...voiceMocks, ...searchVoice.dynamicMocks });
    await nav.getByRole('button', { name: 'Search & Voice', exact: true }).click();
    await expect(page.getByTestId('voice-engine-status-tts')).toBeVisible();
    const stacking: Record<string, string> = {};
    for (const width of WIDTHS) {
      await fit(page, cdp, width);
      for (const direction of ['stt', 'tts'] as const) {
        stacking[`page-${direction}-${width}`] = await lowestOptionOnTop(
          page, page.getByTestId(`voice-provider-btn-${direction}`).locator('button[role="combobox"]'));
      }
    }
    const drawerPanel = page.getByTestId('native-drawer-panel');
    for (const theme of THEMES) {
      await setTheme(page, theme);
      for (const width of WIDTHS) {
        await fit(page, cdp, width);
        for (const direction of ['stt', 'tts'] as const) {
          await page.getByTestId(`voice-engine-details-${direction}`).click();
          await expect(page.getByTestId('voice-details-drawer')).toBeVisible();
          await settle(page);
          const select = direction === 'stt' ? 'local-stt-model-select' : 'local-tts-voice-select';
          if (theme === 'dark') {
            stacking[`drawer-${direction}-${width}`] = await lowestOptionOnTop(
              page, page.getByTestId(select).locator('button[role="combobox"]'));
          }
          if (PHASE === 'after') await assertUncutFields(drawerPanel);
          if (direction === 'stt') {
            await blur(page);
            await capture(page, `voice-stt-${theme}-${width}-${PHASE}.jpg`, await clipAround(page, [drawerPanel], 0));
            const whisper = page.locator('ptah-field').filter({ has: page.getByTestId('local-stt-model-select') });
            if (theme === 'dark' && (await whisper.getByRole('button', { name: /^More about / }).count()) > 0) {
              const panel = await openInfo(page, whisper);
              await capture(page, `voice-stt-info-open-dark-${width}-${PHASE}.jpg`, await clipAround(page, [drawerPanel, panel], 0));
              await page.keyboard.press('Escape');
              await expect(panel).not.toBeVisible();
              // Escape closes the popover only; the drawer stays open.
              await expect(page.getByTestId('voice-details-drawer')).toBeVisible();
            }
          }
          // A custom source is a local draft until Save: no host write.
          await page.getByTestId(`local-${direction}-source-hf`).click();
          await expect(page.getByTestId(`local-${direction}-custom-input`)).toBeVisible();
          await blur(page);
          if (PHASE === 'after') await assertUncutFields(drawerPanel);
          await capture(page, `voice-${direction}-custom-${theme}-${width}-${PHASE}.jpg`, await clipAround(page, [drawerPanel], 0));
          if (PHASE === 'after') {
            await page.getByTestId(`local-${direction}-source-dir`).click();
            await settle(page);
            await assertUncutFields(drawerPanel);
          }
          await page.getByTestId(`local-${direction}-source-curated`).click();
          await page.getByTestId('voice-details-close').click();
          await expect(page.getByTestId('voice-details-drawer')).toBeHidden();
        }
      }
    }
    metrics['stacking'] = stacking;
    if (PHASE === 'after') {
      expect(Object.entries(stacking).filter(([, result]) => result !== 'on-top'), 'Covered select options').toEqual([]);
      expect(metrics['autoHandoffHintLines1168'], 'Auto handoff description lines at 1168 px').toBe(1);
      expect(metrics['routingHintLines1168'], 'Routing suggestions description lines at 1168 px').toBe(1);
    }
  } finally {
    writeFileSync(join(OUT, `metrics-${PHASE}.json`), JSON.stringify(metrics, null, 2) + '\n');
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
  }
});
