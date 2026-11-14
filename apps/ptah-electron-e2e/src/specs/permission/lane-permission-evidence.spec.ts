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

  async function liveApp(): Promise<{ app: ElectronApplication; page: Page; ui: UiDriver; workspace: string; cleanup: () => void }> {
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
      // Both databases stay in the temp folder. The real ~/.ptah/sessions.sqlite
      // can carry newer migrations than this build, and then Codex lanes fail.
      env: { PTAH_DB_PATH: path.join(dir, 'state.sqlite'), PTAH_SESSIONS_DB_PATH: path.join(dir, 'sessions.sqlite') },
      timeout: 180_000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.setViewportSize({ width: 1440, height: 900 });
    const cleanup = (): void => {
      // Keep the host logs in the test output: the profile is deleted next.
      // (test.info().status is not set yet inside the test's finally block.)
      const logs = path.join(profile, 'logs');
      if (fs.existsSync(logs)) {
        fs.cpSync(logs, test.info().outputPath('app-logs'), { recursive: true });
      }
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    };
    return { app, page, ui: new UiDriver(app, page), workspace, cleanup };
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
    // The pane DOM can still hold an earlier session's transcript after a
    // retry, so match the visible bubble with this prompt only.
    const sent = pane.locator('[data-testid="chat-user-message"]:visible').filter({ hasText: prompt.slice(0, 60) });
    await expect(sent.last()).toContainText(prompt);
  }

  function policyText(pane: Locator, level: string): Locator {
    return pane
      .locator('ptah-canvas-detail-transcript')
      .getByText(new RegExp(`requested ${level}\\s*->\\s*effective ${level}`))
      .first();
  }

  /**
   * A session that starts before the Ptah MCP server is ready reports
   * "MCP 0" and has no ptah_* tools. Ask again in a new tab only then: the
   * chip is absent while a working session runs, so its absence is no signal.
   */
  async function askWithPtahTools(page: Page, ui: UiDriver, prompt: string, level: string): Promise<Locator> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const pane = await openClaudeTab(page, ui);
      await ask(pane, prompt);
      const policy = policyText(pane, level);
      const chip = pane.locator('ptah-canvas-detail-transcript:visible ptah-mcp-status-chip button').first();
      const state = async (): Promise<'policy' | 'no-mcp' | 'waiting'> => {
        if (await policy.count()) return 'policy';
        const label = (await chip.count()) ? ((await chip.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '';
        return label === 'MCP 0' ? 'no-mcp' : 'waiting';
      };
      await expect.poll(state, { timeout: 240_000 }).not.toBe('waiting');
      if ((await state()) === 'policy') return pane;
      await page.waitForTimeout(15_000);
    }
    throw new Error('The Ptah MCP server did not connect to a new session');
  }

  async function expectSpawnPolicy(pane: Locator, level: string): Promise<Locator> {
    const transcript = pane.locator('ptah-canvas-detail-transcript');
    const policy = policyText(pane, level);
    await expect(policy).toBeAttached({ timeout: 180_000 });
    if (!(await policy.isVisible())) {
      const disclosure = transcript.locator('[data-test="turn-disclosure-row"][aria-expanded="false"]').last();
      if (await disclosure.count()) await disclosure.click();
    }
    await expect(policy).toBeVisible({ timeout: 30_000 });
    return policy;
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
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      const pane = await askWithPtahTools(live.page, live.ui, 'Call ptah_agent_spawn exactly once with cli codex, permission auto-edit, and task "Run pwd once, then report the directory." Do not change settings. In your reply, quote the Permission line of the spawn result verbatim.', 'auto-edit');
      await expectSpawnPolicy(pane, 'auto-edit');
      await capture(live.page, '2-spawn-matched', 'ptah-canvas-rail-board:visible ptah-canvas-detail-transcript:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('3 Plan lane reports explicit write refusal in agent monitor', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      // A saved Codex default with network allow cannot combine with plan
      // (UNSUPPORTED_LANE_POLICY), so the spawn also asks for network deny.
      const pane = await askWithPtahTools(live.page, live.ui, 'Call ptah_agent_spawn exactly once with cli codex, permission plan, network deny, and task "Create a file named ptah-plan-evidence.txt in the workspace. If Plan mode prevents it, do not write; finish with BLOCKED: plan mode and the reason." Do not change settings. In your reply, quote the Permission line of the spawn result verbatim.', 'plan');
      await expectSpawnPolicy(pane, 'plan');
      const lane = await openCliLane(pane);
      await expect(lane.getByText('BLOCKED: plan mode', { exact: false })).toBeVisible({ timeout: 180_000 });
      // Plan mode must refuse the write: the file must not exist.
      expect(fs.existsSync(path.join(live.workspace, 'ptah-plan-evidence.txt'))).toBe(false);
      await capture(live.page, '3-plan-blocked', 'ptah-canvas-rail-board:visible [data-testid="lane-panel"]:visible');
    } finally {
      await closeDocsApp(live.app);
      live.cleanup();
    }
  });

  test('4 ask lane permission appears in its Claude tab', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      // Claude Code approves read-only Bash commands (such as pwd) before it
      // asks the permission callback, so the lane task must write a file.
      const pane = await askWithPtahTools(live.page, live.ui, 'Call ptah_agent_spawn exactly once with cli claude, permission ask, and task "Use the Bash tool to run exactly: echo lane-ask > ask-evidence.txt . Wait for permission if requested; do not choose a different tool." Do not change settings. In your reply, quote the Permission line of the spawn result verbatim.', 'ask');
      await expectSpawnPolicy(pane, 'ask');
      await capture(live.page, '4-spawn-policy', 'ptah-canvas-rail-board:visible ptah-canvas-detail-transcript:visible');
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
