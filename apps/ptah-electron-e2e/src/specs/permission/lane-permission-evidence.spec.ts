import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchPtah } from '../../support/electron-launcher';
import { UiDriver } from '../../support/ui-driver';
import { visibleNewSessionTrigger } from '../../support/new-session-trigger';
import {
  assertChildHome,
  assertProductionSettingsUnchanged,
  closeDocsApp,
  prepareDocsProfile,
  productionSettingsHash,
} from '../../docs-screenshots/_harness/docs-profile';

/** Real Electron evidence. These tests spend real CLI/API tokens and are opt-in. */
test.describe('@evidence lane permission routing', () => {
  test.skip(process.env['PTAH_EVIDENCE'] !== '1', 'opt-in evidence capture');
  test.describe.configure({ mode: 'serial' });

  const root = path.resolve(__dirname, '../../../../..');
  const shots = path.join(root, '.ptah', 'tmp', 'electron-evidence');
  const composer = 'ptah-chat-input textarea[role="combobox"]:visible';
  const send = '[data-testid="chat-send-btn"]:visible';

  async function capture(page: Page, name: string, crop?: string): Promise<void> {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
    if (crop) {
      const target = page.locator(crop).first();
      await expect(target).toBeVisible();
      await target.screenshot({ path: path.join(shots, `${name}-crop.png`) });
    }
  }

  async function liveApp(): Promise<{ app: ElectronApplication; page: Page; ui: UiDriver; cleanup: () => void }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-lane-evidence-'));
    const profile = path.join(dir, 'profile');
    fs.mkdirSync(profile);
    const app = await launchPtah({
      args: [root],
      userDataDir: profile,
      env: { PTAH_DB_PATH: path.join(dir, 'state.sqlite') },
      timeout: 180_000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.setViewportSize({ width: 1440, height: 900 });
    return { app, page, ui: new UiDriver(app, page), cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) };
  }

  async function openClaudeTab(page: Page, ui: UiDriver): Promise<void> {
    await ui.goto('chat');
    await (await visibleNewSessionTrigger(page)).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator(composer).first()).toBeVisible();
  }

  async function ask(page: Page, prompt: string): Promise<void> {
    await page.locator(composer).first().fill(prompt);
    await page.locator(send).first().click();
  }

  async function openMonitor(page: Page): Promise<void> {
    const panel = page.locator('ptah-agent-monitor-panel:visible').first();
    if (!(await panel.isVisible())) {
      await page.getByRole('button', { name: 'Toggle Agents panel' }).first().click();
    }
    await expect(panel).toBeVisible();
  }

  test('1 saved Codex lane default survives Electron reload', async () => {
    test.setTimeout(240_000);
    const before = productionSettingsHash();
    const profile = prepareDocsProfile();
    let app: ElectronApplication | undefined;
    try {
      app = await launchPtah({ userDataDir: profile.dir, env: profile.env, timeout: 180_000 });
      await assertChildHome(app, profile.home);
      const page = await app.firstWindow();
      const ui = new UiDriver(app, page);
      await ui.goto('settings');
      const matrix = page.locator('[data-testid="cli-matrix"]');
      await expect(matrix).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
      const codex = matrix.locator('[data-testid="cli-matrix-row-codex"], [data-testid="cli-provider-card-codex"]').first();
      await expect(codex).toBeVisible();
      const permission = codex.getByRole('combobox', { name: 'Codex permission default' });
      await permission.selectOption('auto-edit');
      await expect(permission).toHaveValue('auto-edit');
      await expect.poll(() => {
        const saved = path.join(profile.home, '.ptah', 'settings.json');
        return fs.existsSync(saved) && fs.readFileSync(saved, 'utf8').includes('"auto-edit"');
      }, { timeout: 30_000 }).toBe(true);
      await page.reload();
      await expect(matrix).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
      await expect(permission).toHaveValue('auto-edit');
      await capture(page, '1-settings-saved', '[data-testid="cli-matrix"]');
    } finally {
      if (app) await closeDocsApp(app);
      assertProductionSettingsUnchanged(before);
      profile.cleanup();
    }
  });

  test('2 fresh auto-edit spawn shows matching requested and effective policy', async () => {
    test.setTimeout(300_000);
    const live = await liveApp();
    try {
      await openClaudeTab(live.page, live.ui);
      await ask(live.page, 'Call ptah_agent_spawn exactly once with cli codex, permission auto-edit, and task "Run pwd once, then report the directory." Do not change settings. Report the spawn result.');
      const policy = live.page.getByText(/requested auto-edit\s*->\s*effective auto-edit/).first();
      await expect(policy).toBeVisible({ timeout: 180_000 });
      await capture(live.page, '2-spawn-matched', '[data-testid="chat-tool-output"]');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('3 Plan lane reports explicit write refusal in agent monitor', async () => {
    test.setTimeout(300_000);
    const live = await liveApp();
    try {
      await openClaudeTab(live.page, live.ui);
      await openMonitor(live.page);
      await ask(live.page, 'Call ptah_agent_spawn exactly once with cli codex, permission plan, and task "Create a file named ptah-plan-evidence.txt in the workspace. If Plan mode prevents it, do not write; finish with BLOCKED: plan mode and the reason." Do not change settings.');
      const panel = live.page.locator('ptah-agent-monitor-panel:visible').first();
      await expect(panel.getByText('BLOCKED: plan mode', { exact: false })).toBeVisible({ timeout: 180_000 });
      await capture(live.page, '3-plan-blocked', 'ptah-agent-monitor-panel:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('4 ask lane permission appears in its Claude tab', async () => {
    test.setTimeout(300_000);
    const live = await liveApp();
    try {
      await openClaudeTab(live.page, live.ui);
      await openMonitor(live.page);
      await ask(live.page, 'Call ptah_agent_spawn exactly once with cli claude, permission ask, and task "Use Bash to run pwd once. Wait for permission if requested; do not choose a different tool." Do not change settings.');
      const panel = live.page.locator('ptah-agent-monitor-panel:visible').first();
      await expect(panel.getByRole('button', { name: 'Allow' })).toBeVisible({ timeout: 180_000 });
      await expect(panel.getByRole('button', { name: 'Deny' })).toBeVisible();
      await capture(live.page, '4-claude-tab-approval', 'ptah-agent-monitor-panel:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });
});
