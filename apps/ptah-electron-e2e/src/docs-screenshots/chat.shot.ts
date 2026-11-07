import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { test, expect, SAMPLE_REPO } from './_harness/docs-fixtures';
import { shoot, freezeMotion, SHOT_DIR } from './_harness/shooter';
import { openPreviousSessions, sessionRowButton } from '../support/perf-session-fixture';

const devSessionWorkspace = process.env['PTAH_DOCS_SESSION_WORKSPACE']?.trim() || undefined;
const privateNames = [os.userInfo().username, path.basename(devSessionWorkspace ?? '')]
  .filter((name) => name.length >= 3);
const privateText = /(?:[A-Z]:[\\/]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const hasPrivateText = (value: string): boolean =>
  privateText.test(value) || privateNames.some((name) => value.toLowerCase().includes(name.toLowerCase()));

async function maskAndCheck(page: Page, target: Locator, label: string): Promise<void> {
  await page.evaluate((names) => {
    const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacements: Array<[RegExp, string]> = [
      [/(?:[A-Z]:[\\/])[^\s<>"']*/gi, '[local path]'],
      [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
      ...names.map((name): [RegExp, string] => [new RegExp(escape(name), 'gi'), 'sample-user']),
    ];
    const redact = (value: string): string => replacements.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement), value,
    );
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent) node.textContent = redact(node.textContent);
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      element.value = redact(element.value);
    }
    for (const element of document.querySelectorAll<HTMLElement>('[title]')) {
      element.title = redact(element.title);
    }
  }, privateNames);
  const content = await target.evaluate((element) => {
    const fields = Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
      .map((field) => field.value);
    const titles = Array.from(element.querySelectorAll<HTMLElement>('[title]')).map((item) => item.title);
    return [element.textContent ?? '', ...fields, ...titles].join('\n');
  });
  if (hasPrivateText(content)) throw new Error(`[docs-shot] private text remains in ${label}`);
}

async function stageShot(page: Page, runDir: string, name: string, crop?: Locator): Promise<string> {
  await freezeMotion(page);
  await page.waitForTimeout(400);
  if (crop) await crop.scrollIntoViewIfNeeded();
  await maskAndCheck(page, crop ?? page.locator('body'), name);
  const png = crop ? await crop.screenshot({ scale: 'css' }) : await page.screenshot({ scale: 'css' });
  const sharp = (await import('sharp')).default;
  const file = path.join(runDir, `${name}.webp`);
  fs.writeFileSync(file, await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer());
  return file;
}

async function runDirectory(app: ElectronApplication): Promise<string> {
  const profileDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  return path.dirname(profileDir);
}

function publishShots(staged: string[]): void {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (const file of staged) fs.copyFileSync(file, path.join(SHOT_DIR, path.basename(file)));
}

test.describe('docs screenshots — chat', () => {
  test('chat landing and model picker', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const chat = page.locator('ptah-chat-view');
    await expect(chat).toBeVisible();
    const model = page.locator('ptah-model-selector').first();
    await expect(model).toBeVisible();
    await model.getByRole('button', { name: 'Select model' }).click();
    const menu = model.locator('.dropdown-panel');
    await expect(menu).toBeVisible();
    await expect(menu.locator('ptah-native-option').first()).toBeVisible({ timeout: 60_000 });
    const descriptions = menu.locator('ptah-native-option .text-base-content-muted');
    expect(await descriptions.count(), '[docs-shot] model descriptions missing; price mask cannot be verified').toBeGreaterThan(0);
    await descriptions.evaluateAll((elements) => {
      for (const description of elements) {
        const walker = document.createTreeWalker(description, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.textContent) {
            node.textContent = node.textContent.replace(/\s*[\u00B7\u2022]\s*\$[\d.]+\s*\/\s*\$[\d.]+\s*per\s*Mtok\b/gi, '');
          }
        }
      }
    });
    expect(await menu.innerText(), '[docs-shot] model price remains after masking').not.toMatch(/\$\s?\d/);
    await shoot(page, 'chat-model-selector', { crop: menu });
  });

  test('approval modes', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const approval = page.getByTestId('composer-approval-chip').first();
    await expect(approval).toBeVisible();
    await approval.click();
    const popover = page.getByRole('dialog', { name: 'Approval mode settings' });
    await expect(popover).toBeVisible();
    await shoot(page, 'chat-autopilot-toggle', { crop: popover });
  });

  test('file suggestions', async ({ ui, page }) => {
    test.setTimeout(300_000);
    await ui.goto('chat');
    const composer = page.getByRole('combobox', { name: 'Message the orchestrator' }).first();
    await composer.fill('@');
    const suggestions = page.locator('.suggestions-panel').first();
    await expect(suggestions).toBeVisible();
    await shoot(page, 'chat-at-suggestions', { crop: suggestions });
  });
});

test.describe('docs screenshots — live AI chat', () => {
  // D14 exhausted live-prompt authorization. Keep the flow for a future explicit decision.
  test.skip(true, 'D14: no further live AI prompts are authorized.');

  test('live chat overview and execution tree', async ({ ui, page, app }) => {
    test.setTimeout(420_000);
    await ui.goto('chat');
    const chat = page.locator('ptah-chat-view');
    const prompt = 'Use one sub-agent to read README.md and src/pricing.ts in this repository, then summarize what the project does in three bullet points. Do not edit files.';
    const composer = page.getByRole('combobox', { name: 'Message the orchestrator' }).first();
    const stop = page.locator('[data-testid="chat-stop-btn"]:visible');
    await composer.fill(prompt);
    await page.locator('[data-testid="chat-send-btn"]:visible').click();
    await expect(stop).toBeVisible({ timeout: 30_000 });
    await expect(stop).toHaveCount(0, { timeout: 300_000 });
    const tabs = page.getByRole('tablist', { name: 'Lanes' }).first();
    const agentTab = tabs.getByRole('tab').filter({ hasNotText: 'Orchestrator' }).first();
    await expect(agentTab).toBeVisible({ timeout: 30_000 });
    await agentTab.click();
    const agent = page.locator('ptah-canvas-lane-view ptah-subagent-lane:visible').first();
    await expect(agent).toBeVisible();
    await expect(agent.getByTestId('tool-rail').first()).toBeVisible();
    const runDir = await runDirectory(app);
    const staged = [await stageShot(page, runDir, 'chat-execution-tree', agent)];
    await tabs.getByRole('tab', { name: /Orchestrator/i }).click();
    await expect(chat.locator('ptah-message-bubble').last()).toBeVisible();
    staged.push(await stageShot(page, runDir, 'chat-overview', chat));
    publishShots(staged);
  });
});

test.describe('docs screenshots — saved development session', () => {
  test.use({ workspace: devSessionWorkspace ?? SAMPLE_REPO, useDevSessionStorage: Boolean(devSessionWorkspace) });
  test.skip(!devSessionWorkspace, 'Set PTAH_DOCS_SESSION_WORKSPACE to opt into saved-session capture.');

  test('saved conversation, lane, cost, and sessions surfaces', async ({ ui, page, app }) => {
    test.setTimeout(420_000);
    const candidates = ['Run F. Use the Agent tool', 'Run E. Use the Agent tool', 'Convene a Tribunal Council'];
    let selected = '';
    for (const title of candidates) {
      await ui.goto('canvas');
      if (!(await page.getByTestId('rail-previous-sessions').isVisible())) {
        await page.getByRole('button', { name: 'Toggle Sessions panel' }).click();
      }
      await expect(page.getByTestId('rail-previous-sessions')).toBeVisible();
      await openPreviousSessions(page);
      const history = page.getByRole('dialog', { name: 'Previous sessions' });
      await history.getByPlaceholder('Search sessions...').fill(title);
      const row = sessionRowButton(page, title);
      if (!(await row.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false))) {
        await page.keyboard.press('Escape');
        continue;
      }
      await row.click();
      const chat = page.locator('ptah-chat-view');
      await expect(chat).toBeVisible();
      const tabs = page.getByRole('tablist', { name: 'Lanes' }).first();
      const agentTab = tabs.getByRole('tab').filter({ hasNotText: 'Orchestrator' }).first();
      if (!(await agentTab.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false))) continue;
      await agentTab.click();
      const agentLane = page.locator('ptah-canvas-lane-view ptah-subagent-lane:visible').first();
      if (!(await agentLane.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false))) continue;
      const fullOutput = agentLane.getByRole('button', { name: 'Load full output' });
      if (await fullOutput.isVisible().catch(() => false)) await fullOutput.click();
      if (!(await agentLane.getByTestId('tool-rail').first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false))) continue;
      selected = title;
      break;
    }
    if (!selected) throw new Error('[docs-shot] no saved session rendered a sub-agent lane with tool calls');
    console.log('[docs-shot] selected saved session: ' + selected);
    const runDir = await runDirectory(app);
    const staged: string[] = [];
    const agentLane = page.locator('ptah-canvas-lane-view ptah-subagent-lane:visible').first();
    staged.push(await stageShot(page, runDir, 'chat-execution-tree', agentLane));
    const tabs = page.getByRole('tablist', { name: 'Lanes' }).first();
    await tabs.getByRole('tab', { name: /Orchestrator/i }).click();
    const chat = page.locator('ptah-chat-view');
    await expect(chat.locator('ptah-message-bubble').first()).toBeVisible();
    await expect(chat.getByTestId('tool-rail').first()).toBeVisible();
    staged.push(await stageShot(page, runDir, 'chat-overview', chat));
    const stats = page.getByRole('region', { name: 'Session statistics' });
    await expect(stats).toBeVisible();
    staged.push(await stageShot(page, runDir, 'chat-cost-bar', stats));
    const focused = page.getByRole('region', { name: /^Focused session:/ }).first();
    await expect(focused).toBeVisible();
    staged.push(await stageShot(page, runDir, 'sessions-tabs', focused));
    staged.push(await stageShot(page, runDir, 'sessions-overview'));
    await openPreviousSessions(page);
    const history = page.getByRole('dialog', { name: 'Previous sessions' });
    await history.getByPlaceholder('Search sessions...').fill('Run');
    await expect(history.locator('[data-testid="previous-sessions-list"] li').first()).toBeVisible();
    staged.push(await stageShot(page, runDir, 'sessions-history', history));
    publishShots(staged);
  });
});
