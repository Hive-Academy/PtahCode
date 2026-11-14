import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
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
  const paneSelector = 'ptah-canvas-rail-board:visible [data-testid="rail-pane-container"] > [data-pane-side]:visible';

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
    // The worktree root contains dist/apps/ptah-electron (the app install
    // directory), and the host refuses to start a session in an ancestor of
    // it. Open a separate scratch project folder instead.
    const workspace = path.join(dir, 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'README.md'), '# lane permission evidence\n');
    const app = await launchPtah({
      args: [workspace],
      userDataDir: profile,
      env: { PTAH_DB_PATH: path.join(dir, 'state.sqlite') },
      timeout: 180_000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.setViewportSize({ width: 1440, height: 900 });
    return { app, page, ui: new UiDriver(app, page), cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) };
  }

  async function openClaudeTab(page: Page, ui: UiDriver): Promise<Locator> {
    await ui.goto('chat');
    const cards = page.locator('li[ptah-canvas-rail-card][data-tab-id]');
    const before = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')));
    await (await visibleNewSessionTrigger(page)).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => cards.count()).toBeGreaterThan(before.length);
    const ids = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')));
    const id = ids.find((value) => value && !before.includes(value));
    if (!id) throw new Error('New canvas tab did not appear');
    const card = page.locator(`li[ptah-canvas-rail-card][data-tab-id="${id}"]`);
    await card.click();
    const focused = page.locator(paneSelector).first();
    await expect(focused.locator('ptah-canvas-detail-transcript ptah-chat-input textarea[role="combobox"]')).toBeVisible();
    return focused;
  }

  async function ask(pane: Locator, prompt: string): Promise<void> {
    await pane.locator('ptah-canvas-detail-transcript ptah-chat-input textarea[role="combobox"]').fill(prompt);
    await pane.locator('ptah-canvas-detail-transcript [data-testid="chat-send-btn"]').click();
    await expect(pane.locator('[data-testid="chat-user-message"]')).toContainText(prompt);
  }

  async function openCliLane(pane: Locator): Promise<Locator> {
    const tabs = pane.locator('ptah-canvas-lane-tabs:not([inspectorRailAgents])');
    const cli = tabs.getByRole('tab', { name: /active agents|finished agents/i }).first();
    await expect(cli).toBeVisible({ timeout: 180_000 });
    await cli.click();
    const lane = pane.locator('ptah-canvas-lane-view [data-testid="lane-panel"]:visible');
    await expect(lane).toBeVisible();
    return lane;
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
      // Capture before the assertion, so a pre-fix ("before") build still
      // records what the control shows after the reload.
      const label = process.env['PTAH_EVIDENCE_LABEL'] ?? 'saved';
      await codex.scrollIntoViewIfNeeded();
      await capture(page, `1-settings-${label}`);
      fs.mkdirSync(shots, { recursive: true });
      await codex.screenshot({ path: path.join(shots, `1-settings-${label}-crop.png`) });
      await expect(permission).toHaveValue('auto-edit');
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
      const pane = await openClaudeTab(live.page, live.ui);
      await ask(pane, 'Call ptah_agent_spawn exactly once with cli codex, permission auto-edit, and task "Run pwd once, then report the directory." Do not change settings. Report the spawn result.');
      const transcript = pane.locator('ptah-canvas-detail-transcript');
      const policy = transcript.getByText(/requested auto-edit\s*->\s*effective auto-edit/).first();
      await expect(policy).toBeAttached({ timeout: 180_000 });
      const disclosure = transcript.locator('[data-test="turn-disclosure-row"][aria-expanded="false"]').last();
      if (await disclosure.count()) await disclosure.click();
      await expect(policy).toBeVisible({ timeout: 180_000 });
      await capture(live.page, '2-spawn-matched', 'ptah-canvas-rail-board:visible ptah-canvas-detail-transcript:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('3 Plan lane reports explicit write refusal in agent monitor', async () => {
    test.setTimeout(300_000);
    const live = await liveApp();
    try {
      const pane = await openClaudeTab(live.page, live.ui);
      await ask(pane, 'Call ptah_agent_spawn exactly once with cli codex, permission plan, and task "Create a file named ptah-plan-evidence.txt in the workspace. If Plan mode prevents it, do not write; finish with BLOCKED: plan mode and the reason." Do not change settings.');
      const lane = await openCliLane(pane);
      await expect(lane.getByText('BLOCKED: plan mode', { exact: false })).toBeVisible({ timeout: 180_000 });
      await capture(live.page, '3-plan-blocked', 'ptah-canvas-rail-board:visible [data-testid="lane-panel"]:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('4 ask lane permission appears in its Claude tab', async () => {
    test.setTimeout(300_000);
    const live = await liveApp();
    try {
      const pane = await openClaudeTab(live.page, live.ui);
      await ask(pane, 'Call ptah_agent_spawn exactly once with cli claude, permission ask, and task "Use Bash to run pwd once. Wait for permission if requested; do not choose a different tool." Do not change settings.');
      const lane = await openCliLane(pane);
      await expect(lane.getByRole('button', { name: 'Allow' })).toBeVisible({ timeout: 180_000 });
      await expect(lane.getByRole('button', { name: 'Deny' })).toBeVisible();
      await capture(live.page, '4-claude-tab-approval', 'ptah-canvas-rail-board:visible [data-testid="lane-panel"]:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });
});
