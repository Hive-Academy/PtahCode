import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
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

  async function rpc(bridge: RpcBridge, method: string, params: Record<string, unknown>): Promise<unknown> {
    const result = response.parse(await bridge.sendRpc('rpc', {
      type: 'rpc:call', payload: { method, params },
    }, 30_000));
    if (!result.success) throw new Error(`${method}: ${result.error ?? 'RPC failed'}`);
    return result.data;
  }

  async function capture(page: Page, name: string, crop: string): Promise<void> {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
    const target = page.locator(crop).first();
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
    fs.mkdirSync(profile);
    fs.mkdirSync(home);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'README.md'), '# caller attribution evidence\n');
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
    const selected = await rpc(bridge, 'auth:saveSettings', {
      authMethod: 'thirdParty', anthropicProviderId: 'openai-codex', applyTo: 'workspace',
    });
    const selection = z.object({ success: z.boolean(), error: z.string().optional() }).parse(selected);
    if (!selection.success) throw new Error(`Codex provider selection failed: ${selection.error ?? 'unknown'}`);
    const listed = models.parse(await rpc(bridge, 'config:models-list', { workspacePath: workspace }));
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

  test('item a: Codex tab starts a child session attributed to its parent', async () => {
    test.setTimeout(600_000);
    const live = await liveApp();
    try {
      const parent = await openCodexTab(live.page, live.app, live.bridge, live.workspace, 'auto-edit');
      const before = await live.page.locator(railCard).count();
      await ask(live.page, 'Call the Ptah MCP tool ptah_session_start exactly once with a trivial task: "Reply with CHILD-READY." Report its result.');
      await expect.poll(() => live.page.locator(railCard).count(), { timeout: 360_000, intervals: [2_000] }).toBeGreaterThan(before);
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
      await ask(live.page, 'Call ptah_agent_list, then ptah_agent_spawn once for a small available Codex lane. Its sole task: call ptah_agent_report with message "E2E-REPORT-MARKER" and exit. Wait for the report.');
      const report = live.page.locator('[data-testid="chat-peer-message"]', { hasText: 'E2E-REPORT-MARKER' });
      await expect(report).toBeVisible({ timeout: 420_000 });
      await expect(live.page.locator(`${railCard}[data-tab-id="${parent}"]`)).toBeVisible();
      await capture(live.page, 'caller-item-b-report', '[data-testid="chat-peer-message"]');
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
      await ask(live.page, 'Run the harmless shell command `git status` exactly once. Wait for permission if requested.');
      const approval = live.page.locator('ptah-permission-request-card:visible', { hasText: 'git status' }).first();
      await expect(approval).toBeVisible({ timeout: 360_000 });
      await expect(live.page.locator(`${railCard}[data-tab-id="${parent}"]`)).toBeVisible();
      await capture(live.page, 'caller-item-c-approval-before-deny', 'ptah-permission-request-card:visible');
      await approval.getByRole('button', { name: 'Deny this request and stop execution' }).click();
      await expect(approval).toHaveCount(0, { timeout: 60_000 });
      await capture(live.page, 'caller-item-c-approval-denied', `${railCard}[data-tab-id="${parent}"]`);
    } finally {
      await live.app.close();
      live.cleanup();
    }
  });
});
