import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import { launchPtah } from '../../support/electron-launcher';
import { RpcBridge } from '../../support/rpc-bridge';
import { UiDriver } from '../../support/ui-driver';
import { visibleNewSessionTrigger } from '../../support/new-session-trigger';

/** Paid, real Electron evidence. Run only with PTAH_EVIDENCE=1. */
test.describe('@evidence Codex caller attribution', () => {
  test.skip(process.env['PTAH_EVIDENCE'] !== '1', 'opt-in real Codex evidence');
  test.describe.configure({ mode: 'serial' });

  const root = path.resolve(__dirname, '../../../../..');
  const shots = path.join(root, '.ptah', 'tmp', 'electron-evidence');
  const composer = 'ptah-chat-input textarea[role="combobox"]:visible';
  const send = '[data-testid="chat-send-btn"]:visible';
  const railCard = 'li[ptah-canvas-rail-card][data-tab-id]:visible';
  const response = z.object({ success: z.boolean(), data: z.unknown().optional(), error: z.string().optional() });
  const models = z.object({ models: z.array(z.object({ id: z.string(), name: z.string() })) });
  const clis = z.object({ clis: z.array(z.object({ cli: z.string(), installed: z.boolean() })) });

  async function rpc(bridge: RpcBridge, method: string, params: Record<string, unknown>): Promise<unknown> {
    const result = response.parse(await bridge.sendRpc('rpc', {
      type: 'rpc:call', payload: { method, params },
    }, 30_000));
    if (!result.success) throw new Error(`${method}: ${result.error ?? 'RPC failed'}`);
    return result.data;
  }

  async function capture(page: Page, name: string, crop: string | Locator): Promise<void> {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
    const target = (typeof crop === 'string' ? page.locator(crop) : crop).first();
    await expect(target).toBeVisible();
    await target.screenshot({ path: path.join(shots, `${name}-crop.png`) });
  }

  async function liveApp(): Promise<{ app: ElectronApplication; page: Page; bridge: RpcBridge; workspace: string; cleanup: () => void }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-caller-evidence-'));
    const profile = path.join(dir, 'profile');
    const home = path.join(dir, 'home');
    // A separate project folder: the repository root contains the app build
    // (dist/apps/ptah-electron), and the host refuses sessions in an ancestor
    // of the app installation directory.
    const workspace = path.join(dir, 'workspace');
    // Evidence run 1 used the repository as workspace and the app deleted tracked
    // files. Refuse any temp folder that resolves inside the repository.
    const inside = path.relative(root, dir);
    if (!inside.startsWith('..') && !path.isAbsolute(inside)) {
      throw new Error(`Evidence workspace must be outside the repository: ${dir}`);
    }
    fs.mkdirSync(profile);
    fs.mkdirSync(home);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'README.md'), '# caller attribution evidence\n');
    // ptah_session_start puts each child in a git worktree of the workspace, so
    // the temp workspace needs its own repository with one commit at HEAD. This
    // throwaway fixture repository is never pushed; signing is off only here.
    const git = (...args: string[]): void => {
      execFileSync('git', ['-c', 'user.name=Ptah Evidence', '-c', 'user.email=evidence@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { cwd: workspace, stdio: 'ignore' });
    };
    git('init', '-q', '-b', 'main');
    git('add', 'README.md');
    git('commit', '-q', '-m', 'evidence fixture');
    const app = await launchPtah({
      args: [workspace], userDataDir: profile, timeout: 180_000,
      env: {
        PTAH_DB_PATH: path.join(dir, 'state.sqlite'),
        HOME: home, USERPROFILE: home,
        CODEX_HOME: process.env['CODEX_HOME'] ?? path.join(os.homedir(), '.codex'),
      },
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    return { app, page, bridge: new RpcBridge(app), workspace, cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) };
  }

  async function openCodexTab(page: Page, app: ElectronApplication, bridge: RpcBridge, workspace: string, permission: 'auto-edit' | 'ask'): Promise<string> {
    // Under memory pressure the boot-time CLI probe can miss Codex (5/8 CLIs),
    // and then the Codex model catalog stays empty. Probe again until Codex shows.
    await expect.poll(async () => {
      const detected = clis.parse(await rpc(bridge, 'agent:detectClis', {}));
      return detected.clis.some((entry) => entry.cli === 'codex' && entry.installed);
    }, { timeout: 120_000, intervals: [5_000] }).toBe(true);
    const selected = await rpc(bridge, 'auth:saveSettings', {
      authMethod: 'thirdParty', anthropicProviderId: 'openai-codex', applyTo: 'workspace',
    });
    const selection = z.object({ success: z.boolean(), error: z.string().optional() }).parse(selected);
    if (!selection.success) throw new Error(`Codex provider selection failed: ${selection.error ?? 'unknown'}`);
    // The Codex model catalog loads asynchronously after the provider switch,
    // so an early list can be empty. Ask again until it has entries.
    let listed: z.infer<typeof models> = { models: [] };
    await expect.poll(async () => {
      listed = models.parse(await rpc(bridge, 'config:models-list', { workspacePath: workspace }));
      return listed.models.length;
    }, { timeout: 120_000, intervals: [3_000] }).toBeGreaterThan(0);
    const model = listed.models.find((entry) => /codex|gpt/i.test(entry.name)) ?? listed.models[0];
    if (!model) throw new Error('No Codex model available');
    await rpc(bridge, 'config:model-switch', { model: model.id, applyTo: 'workspace' });
    await rpc(bridge, 'config:autopilot-toggle', { enabled: permission !== 'ask', permissionLevel: permission, sessionId: null });
    await page.reload();
    const ui = new UiDriver(app, page);
    await ui.goto('chat');
    const before = await page.locator(railCard).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')));
    await (await visibleNewSessionTrigger(page)).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.poll(() => page.locator(railCard).count(), { timeout: 60_000 }).toBeGreaterThan(before.length);
    const ids = await page.locator(railCard).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tab-id')));
    const id = ids.find((value) => value && !before.includes(value));
    if (!id) throw new Error('Codex tab did not appear');
    await expect(page.locator(composer).first()).toBeVisible();
    return id;
  }

  async function ask(page: Page, prompt: string): Promise<void> {
    await page.locator(composer).first().fill(prompt);
    await page.locator(send).first().click();
  }

  /**
   * New Codex tabs start in Manual permission mode, so each Ptah MCP tool call
   * raises an approval prompt that times out after 60 s. Allow only prompts
   * for `ptah_*` tools of the Ptah MCP server; leave every other prompt alone.
   */
  async function allowPtahTools(page: Page): Promise<void> {
    const prompts = page.locator('[data-testid="rail-card-needs-you"]:visible', {
      hasText: /ptah MCP server to run tool\W+ptah_/,
    });
    const count = await prompts.count();
    for (let index = 0; index < count; index += 1) {
      const allow = prompts.nth(index)
        .getByRole('group', { name: 'Permission actions' })
        .getByRole('button', { name: 'Allow', exact: true });
      if (await allow.isEnabled()) await allow.click({ timeout: 5_000 });
    }
  }

  test('item a: Codex tab starts a child session attributed to its parent', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      const parent = await openCodexTab(live.page, live.app, live.bridge, live.workspace, 'auto-edit');
      const before = await live.page.locator(railCard).count();
      await ask(live.page, 'Call the Ptah MCP tool ptah_session_start exactly once with a trivial task: "Reply with CHILD-READY." Report its result.');
      await expect.poll(async () => {
        await allowPtahTools(live.page);
        return live.page.locator(railCard).count();
      }, { timeout: 360_000, intervals: [2_000] }).toBeGreaterThan(before);
      const child = live.page.locator(railCard).filter({ has: live.page.locator('[data-testid="rail-child-glyph"]') }).first();
      await expect(child).toBeVisible({ timeout: 60_000 });
      const parentCard = live.page.locator(`${railCard}[data-tab-id="${parent}"]`);
      await expect(parentCard.locator('[data-testid="rail-child-count"]')).toBeVisible({ timeout: 60_000 });
      await expect(live.page.locator('[data-testid="chat-tool-output"]', { hasText: 'unattributed-caller' })).toHaveCount(0);
      await capture(live.page, 'caller-item-a-child', railCard);
    } finally {
      await live.app.close();
      live.cleanup();
    }
  });

  test('item b: lane report arrives in the Codex parent tab', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      const parent = await openCodexTab(live.page, live.app, live.bridge, live.workspace, 'auto-edit');
      await ask(live.page, 'Call ptah_agent_list, then call ptah_agent_spawn once with cli "codex" and timeout 600000. The lane task: call ptah_agent_report with message "E2E-REPORT-MARKER", then exit. Wait for the report.');
      // The completion notice repeats the task text, so it also contains the
      // marker. Accept only a real lane report envelope.
      const report = live.page.locator('[data-testid="chat-peer-message"]', {
        hasText: /<agent-report[\s\S]*E2E-REPORT-MARKER/,
      });
      await expect.poll(async () => {
        await allowPtahTools(live.page);
        return report.count();
      }, { timeout: 420_000, intervals: [2_000] }).toBeGreaterThan(0);
      await expect(report.first()).toBeVisible();
      await expect(live.page.locator(`${railCard}[data-tab-id="${parent}"]`)).toBeVisible();
      await capture(live.page, 'caller-item-b-report', report);
    } finally {
      await live.app.close();
      live.cleanup();
    }
  });

  test('item c: Codex approval prompt routes to its own session UI; deny it', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      const parent = await openCodexTab(live.page, live.app, live.bridge, live.workspace, 'ask');
      // `git status` is on the Codex known-safe list and can run without a prompt.
      await ask(live.page, 'Run the harmless shell command `node --version` exactly once. Wait for permission if requested.');
      const needsYou = '[data-testid="rail-card-needs-you"]';
      const parentPrompt = `${railCard}[data-tab-id="${parent}"] ${needsYou}`;
      // The command can show as text or as a JSON argument list, so match any
      // permission prompt on the parent card that is not a Ptah MCP tool prompt.
      const notPtahTool = { hasNotText: /ptah MCP server/ };
      const approval = live.page.locator(parentPrompt, notPtahTool);
      await expect(approval).toBeVisible({ timeout: 360_000 });
      // The prompt shows on the parent tab only, not on another session card.
      await expect(live.page.locator(`${needsYou}:visible`, notPtahTool)).toHaveCount(1);
      await capture(live.page, 'caller-item-c-approval-before-deny', parentPrompt);
      await approval.getByRole('group', { name: 'Permission actions' })
        .getByRole('button', { name: 'Deny', exact: true }).click();
      await expect(approval).toHaveCount(0, { timeout: 60_000 });
      await capture(live.page, 'caller-item-c-approval-denied', `${railCard}[data-tab-id="${parent}"]`);
    } finally {
      await live.app.close();
      live.cleanup();
    }
  });
});
