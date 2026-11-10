import { test, expect } from '../docs-screenshots/_harness/docs-fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Captures for the "Inbox" design preview pages of Machines and Reviews (TASK_2026_913).
 * The app and its render are real. The fixture workspace has no machines and no review runs, so
 * the populated states put SAMPLE DATA into the real stores through the Angular debug API of the
 * development build. The preview pages say so. These captures are evidence, not a gate.
 */
const ROOT = path.resolve(__dirname, '../../../..');
const OUT = process.env['PTAH_PREVIEW_OUT'] ?? path.join(ROOT, 'dist/apps/ptah-electron-e2e/design-preview');
const PROTOTYPES = path.join(ROOT, '.ptah/specs/TASK_2026_UX_REVIEWS_MACHINES/prototype');

test.use({ workspace: path.join(ROOT, '.ptah/specs/TASK_2026_904/wave1/visual/sample-repo') });

type Theme = 'dark' | 'light';
const THEMES: readonly Theme[] = ['dark', 'light'];

async function size(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.setResizable(true);
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(s.width, s.height);
  }, { width, height });
}

async function shot(page: Page, name: string, theme: Theme): Promise<void> {
  await page.evaluate((mode) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode === 'dark' ? 'ptah-glass' : 'ptah-glass-light');
    root.setAttribute('data-theme-mode', mode);
    root.setAttribute('data-glass-effects', 'on');
    root.setAttribute('data-glass', 'on');
    root.setAttribute('data-glass-mode', mode);
  }, theme);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1590, 990);
  await page.waitForTimeout(500);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`), animations: 'disabled', caret: 'hide', scale: 'css' });
}

/** Screenshot of an approved prototype file in a second window of the same Electron build. */
async function prototypeShot(app: ElectronApplication, file: string, name: string, theme: Theme): Promise<void> {
  const url = `${pathToFileURL(path.join(PROTOTYPES, file)).href}?theme=${theme}&state=main`;
  const opened = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }, target) => {
    const win = new BrowserWindow({ width: 1600, height: 1000, useContentSize: true, show: true });
    void win.loadURL(target);
  }, url);
  const proto = await opened;
  await proto.waitForLoadState('networkidle');
  await proto.waitForTimeout(1500);
  fs.mkdirSync(OUT, { recursive: true });
  await proto.screenshot({ path: path.join(OUT, `${name}-${theme}.png`), scale: 'css' });
  await proto.close();
}

async function openMachines(ui: { goto(view: 'chat'): Promise<void>; pushEvent(m: { type: string; payload: unknown }): Promise<void> }, page: Page): Promise<void> {
  await ui.goto('chat');
  for (let attempt = 0; attempt < 15 && !(await page.locator('ptah-machines-view').count()); attempt++) {
    await ui.pushEvent({ type: 'switchView', payload: { view: 'machines' } });
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('machines-view')).toBeVisible();
}

test('machines inbox', async ({ app, ui, page }) => {
  await size(app, 1600, 1000);
  await openMachines(ui, page);
  for (const theme of THEMES) await shot(page, 'machines-empty', theme);

  const seed = (): void => {
    interface Debug { getComponent(el: Element | null): { store: Record<string, { set(v: unknown): void }>; error?: { set(v: unknown): void } } }
    const ng = (window as unknown as { ng: Debug }).ng;
    const store = ng.getComponent(document.querySelector('ptah-machines-view')).store;
    // The sample machines do not exist in the backend, so the real session RPC fails. Clear that local error.
    const list = document.querySelector('ptah-remote-session-list');
    if (list) ng.getComponent(list).error?.set(null);
    const now = Date.now();
    const versions = { local: { ptah: '1.42.0', protocol: { min: 7, max: 7 } }, remote: { ptah: '1.42.0', protocol: { min: 7, max: 7 } } };
    store['_machines'].set([
      { machineId: 'm-build', alias: 'build', displayName: 'build-01', state: 'connected', lastSeenAt: now, versions },
      { machineId: 'm-laptop', alias: 'laptop', displayName: 'laptop', state: 'reconnecting', lastSeenAt: now - 20_000 },
      { machineId: 'm-gpu', alias: 'gpu', displayName: 'gpu-box', state: 'offline', lastSeenAt: now - 300_000, nextRetryAt: now + 600_000 },
      { machineId: 'm-staging', alias: 'staging', displayName: 'staging-02', state: 'version-mismatch', lastSeenAt: now - 60_000 },
    ]);
    const ws = { workspaceId: 'ws-api', name: 'api', path: '/srv/api' };
    store['_workspaces'].set(new Map([['m-build', [ws]]]));
    store['_sessions'].set(new Map([['m-build', new Map([['ws-api', [
      { sessionId: 's1', title: 'fix-auth', state: 'running', updatedAt: now - 120_000, provider: 'Claude', logged: true },
      { sessionId: 's2', title: 'api-contracts', state: 'idle', updatedAt: now - 840_000, provider: 'Codex', logged: true },
      { sessionId: 's3', title: 'release-check', state: 'interrupted', updatedAt: now - 3_600_000, provider: 'Gemini', logged: true },
    ]]])]]));
    // One waiting tool approval in the opened sample session "fix-auth".
    const request = { id: 'p1', toolName: 'Bash', toolInput: { command: 'npm run db:migrate -- --env staging' }, toolUseId: 'tu1', timestamp: now, description: 'Run a command', timeoutAt: now + 42_000 };
    store['_views'].set(new Map([['m-build\u0000s1', { machineId: 'm-build', reducer: { pendingPermissions: [request], timedOutPermissions: [] }, lockUnavailable: false, error: null }]]));
  };
  await page.evaluate(seed);
  await page.getByRole('option', { name: /build-01/ }).first().click();
  await expect(page.getByTestId('machine-detail')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.evaluate(seed);
  await page.waitForTimeout(300);
  for (const theme of THEMES) await shot(page, 'machines-main', theme);

  // Readiness after a check: the sample machine has no backend, so the result is sample data.
  await page.getByTestId('machine-readiness-tile').locator('summary').click();
  await expect(page.locator('ptah-readiness-panel')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    interface Panel { loading: { set(v: unknown): void }; error: { set(v: unknown): void }; result: { set(v: unknown): void } }
    const ng = (window as unknown as { ng: { getComponent(el: Element | null): Panel } }).ng;
    const panel = ng.getComponent(document.querySelector('ptah-readiness-panel'));
    const pass = (id: string, label: string, detail: string) => ({ id, label, status: 'pass', detail });
    panel.loading.set(false);
    panel.error.set(null);
    panel.result.set({ machineId: 'm-build', local: { ready: true, checks: [pass('lock', 'Driver lock', 'Free')] }, remote: { ready: true, checks: [
      pass('os', 'Operating system', 'Ubuntu 24.04'), pass('node', 'Node and SQLite', 'Node 24.1'), pass('versions', 'Versions', 'ptah 1.42.0, protocol 7'),
      pass('listener', 'Listener', 'Port open'), pass('workspaces', 'Workspaces', '1 workspace'), pass('provider', 'Provider', 'Claude signed in'),
    ] } });
  });
  await page.waitForTimeout(300);
  for (const theme of THEMES) await shot(page, 'machines-readiness', theme);
  await page.getByTestId('machine-readiness-tile').locator('summary').click();

  await size(app, 720, 1000);
  await page.waitForTimeout(400);
  await shot(page, 'machines-narrow', 'dark');
  await size(app, 1600, 1000);

  // Error state: the machine list failed to load.
  await page.evaluate(() => {
    interface Debug { getComponent(el: Element | null): { store: Record<string, { set(v: unknown): void }> } }
    const store = (window as unknown as { ng: Debug }).ng.getComponent(document.querySelector('ptah-machines-view')).store;
    store['_views'].set(new Map());
    store['_machines'].set([]);
    store['_error'].set({ message: 'The machine service did not answer.' });
  });
  await page.waitForTimeout(400);
  for (const theme of THEMES) await shot(page, 'machines-error', theme);

  for (const theme of THEMES) await prototypeShot(app, 'machines-a.html', 'machines-prototype', theme);
});

test('reviews inbox', async ({ app, ui, page }) => {
  await size(app, 1600, 1000);
  await ui.goto('review-runs');
  await expect(page.locator('ptah-review-runs-page')).toBeVisible();
  await page.waitForTimeout(1500);
  for (const theme of THEMES) await shot(page, 'reviews-empty', theme);

  await page.evaluate(() => {
    interface Debug { getComponent(el: Element | null): { store: Record<string, { set(v: unknown): void }> } }
    const ng = (window as unknown as { ng: Debug }).ng;
    const store = ng.getComponent(document.querySelector('ptah-review-runs-page')).store;
    const at = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
    const stage = (name: string, status: string, durationMs: number) => ({ name, status, family: name === 'lenses' ? 'codex' : null, scope: null, durationMs, error: null, artifactPath: null });
    const stages = (status: string) => ['discovery', 'context', 'checks', 'triage', 'lenses', 'verification', 'identity', 'publication'].map((name, i) => stage(name, status, 1200 + i * 900));
    const run = (prNumber: number, prTitle: string, name: string, sha: string, status: string, trigger: string, age: number) => ({
      repo: { owner: 'org', name }, prNumber, prTitle, headSha: sha.padEnd(40, '0'), attemptId: `attempt-${prNumber}`, trigger, configHash: null, status,
      createdAt: at(age + 6), startedAt: status === 'queued' ? null : at(age + 5), completedAt: ['queued', 'running'].includes(status) ? null : at(age), deadlineAt: null,
      coverage: ['correctness', 'security', 'tests', 'style'], postedCount: 2, suppressedCount: 1, stages: stages(status === 'queued' ? 'queued' : status === 'running' ? 'running' : 'succeeded'),
    });
    const runs = [
      run(482, 'Fix cache key collision', 'api', 'a1b2c3d4e5', 'succeeded', 'poll', 4),
      run(479, 'Add retry policy', 'api', 'b6c7d8e9f0', 'running', 'manual', 9),
      run(477, 'Handle partial index', 'web', 'c2d3e4f5a6', 'partial', 'poll', 31),
      run(470, 'Repair auth fallback', 'cli', 'd3e4f5a6b7', 'failed', 'manual', 55),
      run(468, 'Update release notes', 'docs', 'e4f5a6b7c8', 'queued', 'poll', 70),
      run(465, 'Improve session cleanup', 'api', 'f5a6b7c8d9', 'interrupted', 'manual', 120),
      run(461, 'Avoid duplicate posts', 'web', 'a6b7c8d9e0', 'superseded', 'poll', 180),
      run(458, 'Fix parser bounds', 'cli', 'b7c8d9e0f1', 'succeeded', 'poll', 240),
    ];
    store['repositories'].set(['api', 'web', 'cli', 'docs'].map((name) => ({ owner: 'org', name, enabled: name !== 'docs', dryRun: name === 'web', publicationPaused: name === 'cli' })));
    store['nextCursor'].set('cursor-2');
    store['runs'].set(runs);
    store['lastRefreshedAt'].set(new Date());
    store['state'].set('ready');
    store['selectedAttemptId'].set(runs[0].attemptId);
    store['selectedRun'].set(runs[0]);
    store['detailState'].set('ready');
    store['findings'].set([]);
    store['findingsState'].set('ready');
  });
  await expect(page.locator('ptah-review-run-detail')).toBeVisible();
  for (const theme of THEMES) await shot(page, 'reviews-main', theme);

  await size(app, 1100, 1000);
  await page.waitForTimeout(400);
  await shot(page, 'reviews-medium', 'dark');
  await size(app, 1600, 1000);

  // Error state: the run list failed to load and no cached runs exist.
  await page.evaluate(() => {
    interface Debug { getComponent(el: Element | null): { store: Record<string, { set(v: unknown): void }> } }
    const store = (window as unknown as { ng: Debug }).ng.getComponent(document.querySelector('ptah-review-runs-page')).store;
    store['selectedAttemptId'].set(null);
    store['selectedRun'].set(null);
    store['runs'].set([]);
    store['nextCursor'].set(null);
    store['state'].set('error');
  });
  await page.waitForTimeout(400);
  for (const theme of THEMES) await shot(page, 'reviews-error', theme);

  for (const theme of THEMES) await prototypeShot(app, 'reviews-a.html', 'reviews-prototype', theme);
});
