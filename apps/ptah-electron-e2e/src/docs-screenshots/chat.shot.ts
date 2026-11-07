import { test, expect } from './_harness/docs-fixtures';
import { shoot } from './_harness/shooter';
import { SAMPLE_REPO } from './_harness/docs-fixtures';
import { openPreviousSessions, sessionRowButton } from '../support/perf-session-fixture';
import * as os from 'os';
import * as path from 'path';

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

const devSessionWorkspace = process.env['PTAH_DOCS_SESSION_WORKSPACE']?.trim() || undefined;
const privateText = /(?:[A-Z]:[\\/]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const privateNames = [os.userInfo().username, path.basename(devSessionWorkspace ?? '')]
  .filter((name) => name.length >= 3)
  .map((name) => name.toLowerCase());
const hasPrivateText = (value: string): boolean =>
  privateText.test(value) || privateNames.some((name) => value.toLowerCase().includes(name));

test.describe('docs screenshots — saved development session', () => {
  test.use({
    workspace: devSessionWorkspace ?? SAMPLE_REPO,
    useDevSessionStorage: Boolean(devSessionWorkspace),
  });
  test.skip(!devSessionWorkspace, 'Set PTAH_DOCS_SESSION_WORKSPACE to opt into saved-session capture.');

  test('real conversation and execution tree, if private text is absent', async ({ ui, page }) => {
    test.setTimeout(300_000);
    let overviewCaptured = false;
    let treeCaptured = false;
    const candidates = [
      'Run F. Use the Agent tool',
      'Run E. Use the Agent tool',
      'can you spawn the claude cli tool',
      'Convene a Tribunal Council',
      'what model are u and what skills',
      'agentic check',
      'orchestrate the ui',
      'hey',
    ];
    for (const title of candidates) {
      await ui.goto('canvas');
      try {
        await openPreviousSessions(page);
      } catch (error: unknown) {
        // Saved sessions are optional dev data; an unavailable dialog cannot
        // justify replacing the committed README images with empty UI.
        console.log(`[docs-shot] previous sessions unavailable: ${error instanceof Error ? error.name : 'unknown error'}`);
        test.skip(true, 'Saved sessions could not be opened from the isolated development copy.');
        return;
      }
      const dialog = page.getByRole('dialog', { name: 'Previous sessions' });
      if (!(await dialog.isVisible())) {
        // Restoring the canvas can close the dialog after the list first loads.
        // A transient close must not fail unrelated screenshot captures.
        console.log(`[docs-shot] previous sessions dialog closed before searching "${title}"`);
        continue;
      }
      await dialog.getByPlaceholder('Search sessions...').fill(title);
      const row = sessionRowButton(page, title);
      if (!(await row.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false))) {
        await page.keyboard.press('Escape');
        continue;
      }
      await row.click();
      const chat = page.locator('ptah-chat-view');
      await expect(chat).toBeVisible();
      await page.waitForTimeout(1_500);
      const visibleText = await chat.innerText();
      const toolRows = await chat.locator('[data-testid="tool-rail"]').count();
      const agentNodes = await chat.locator('ptah-inline-agent-bubble').count();
      const assistantMessages = await chat.locator('ptah-message-bubble').count();
      const privacyMatch = hasPrivateText(visibleText);
      console.log(`[docs-shot] saved session "${title}": messages=${assistantMessages} tools=${toolRows} agents=${agentNodes} private=${privacyMatch}`);
      if (privacyMatch || assistantMessages < 2 || toolRows < 1) continue;
      if (!overviewCaptured) {
        await shoot(page, 'chat-overview', { crop: chat });
        console.log(`[docs-shot] chat-overview session: ${title}`);
        overviewCaptured = true;
      }
      const agent = chat.locator('ptah-inline-agent-bubble').first();
      if (agentNodes > 0 && !treeCaptured) {
        const header = agent.locator('button[aria-expanded]').first();
        if (await header.getAttribute('aria-expanded') === 'false') await header.click();
        const savedOutput = agent.getByTestId('load-agent-output');
        if (await savedOutput.isVisible().catch(() => false)) await savedOutput.click();
        await page.waitForTimeout(800);
        if (!hasPrivateText(await agent.innerText()) &&
            await agent.locator('[data-testid="tool-rail"]').count() > 0 &&
            await agent.locator('ptah-token-badge').count() > 0 &&
            await agent.locator('ptah-cost-badge').count() > 0) {
          await shoot(page, 'chat-execution-tree', { crop: agent });
          console.log(`[docs-shot] chat-execution-tree session: ${title}`);
          treeCaptured = true;
        }
      }
      if (overviewCaptured && treeCaptured) return;
    }
    if (!overviewCaptured) test.skip(true, 'No saved session with a neutral assistant transcript and tool call was replayable.');
    if (!treeCaptured) console.log('[docs-shot] no neutral saved execution tree with tool rows and token/cost badges');
  });
});
