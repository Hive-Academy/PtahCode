import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signal, type Provider, type EnvironmentProviders } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ClaudeRpcService, ElectronLayoutService, GIT_SESSION_SCOPE_SOURCE,
  MESSAGE_HANDLERS, MessageRouterService, VSCodeService,
} from '@ptah-extension/core';
import { GIT_WINDOW_CONTEXT } from '@ptah-extension/git-ui';
import { GitDockScopeStore } from '@ptah-extension/git-ui/services';
import { GIT_WINDOW_PUSH_TYPES, type GitWindowScope } from '@ptah-extension/shared';
import { ChildGitSessionScopeSource, GitWindowScopeHandler, gitWindowConfig, mountGitWindowHost } from './git-window.config';

const scope: GitWindowScope = {
  version: 1, sequence: 8, workspaceRoot: 'C:/repo', repoRoot: 'C:/repo',
  mode: 'follow-session', active: null, pinnedTabId: null, open: [], unresolved: false,
};

function providers(): unknown[] {
  const result: unknown[] = [];
  const walk = (items: readonly (Provider | EnvironmentProviders)[]): void => {
    for (const item of items) Array.isArray(item) ? walk(item) : result.push(item);
  };
  walk(gitWindowConfig.providers);
  return result;
}

describe('Git child bootstrap', () => {
  const main = readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8');

  it('loads both Git child modules lazily and keeps early push replay', () => {
    expect(main).toContain("childWindow === 'git'");
    expect(main).toContain("import('./app/git-window/git-window.component')");
    expect(main).toContain("import('./app/git-window/git-window.config')");
    expect(main).not.toMatch(/^import[^;]*git-window/m);
    expect(main).toContain('earlyHostMessages.push(value)');
    expect(main).toContain('replayed: true');
  });

  it('keeps a host Attach control independent of the ReviewShell chunk', () => {
    const component = readFileSync(join(__dirname, 'git-window.component.ts'), 'utf8');
    expect(component).toContain('gitWindow:close');
    expect(component).toContain('gitWindow:getScope');
    expect(component.indexOf('Attach')).toBeLessThan(component.indexOf('*ngComponentOutlet'));
    expect(component).toContain('Resolving Git scope');
  });

  it('mounts its own host', () => {
    document.body.innerHTML = '<ptah-root></ptah-root>';
    mountGitWindowHost(document);
    expect(document.querySelector('ptah-git-window')).not.toBeNull();
    expect(document.querySelector('ptah-root')).toBeNull();
    document.body.innerHTML = '';
  });

  it('keeps the main handler and hides workspace registration in the child context', () => {
    const app = readFileSync(join(__dirname, '..', 'app.config.ts'), 'utf8');
    const review = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'libs/frontend/git-ui/src/lib/review-shell/review-shell.component.ts'), 'utf8');
    const worktree = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'libs/frontend/git-ui/src/lib/task/task-worktree-view.component.ts'), 'utf8');
    expect(app).toContain('useExisting: GitWindowSync');
    expect(review).toContain('[hideOpenAsWorkspace]="windowContext?.role === \'child\'"');
    expect(review).toContain("if (this.windowContext?.role === 'child') return;");
    expect(worktree).toContain("if (this.windowContext?.role === 'child') return;");
  });
});

describe('Git child providers and scopes', () => {
  const store = { applyWindowScope: jest.fn().mockReturnValue(true) };
  const rpc = { call: jest.fn() };

  beforeEach(() => {
    store.applyWindowScope.mockClear();
    rpc.call.mockReset();
    TestBed.configureTestingModule({ providers: [
      ...gitWindowConfig.providers,
      { provide: GitDockScopeStore, useValue: store },
      { provide: ClaudeRpcService, useValue: rpc },
      { provide: VSCodeService, useValue: {
        config: signal({ isElectron: true }), isElectron: true,
        handleMessage: jest.fn(), handledMessageTypes: [],
      } },
    ] });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('provides layout without registering it as a message handler', () => {
    const handlers = providers().filter((item): item is { provide: unknown; useExisting: unknown } =>
      typeof item === 'object' && item !== null && 'provide' in item && item.provide === MESSAGE_HANDLERS);
    expect(handlers.map((item) => item.useExisting)).toContain(GitWindowScopeHandler);
    expect(handlers.map((item) => item.useExisting)).not.toContain(ElectronLayoutService);
    expect(providers()).toContain(ElectronLayoutService);
    expect(TestBed.inject(GIT_WINDOW_CONTEXT).role).toBe('child');
    expect(TestBed.inject(GIT_SESSION_SCOPE_SOURCE)).toBe(TestBed.inject(ChildGitSessionScopeSource));
    expect(TestBed.inject(MessageRouterService)).toBeTruthy();
  });

  it('routes early scope pushes and rejects invalid and stale sequences', () => {
    const handler = TestBed.inject(GitWindowScopeHandler);
    handler.handleMessage({ type: GIT_WINDOW_PUSH_TYPES.scope, payload: scope });
    expect(handler.scope()?.sequence).toBe(8);
    handler.handleMessage({ type: GIT_WINDOW_PUSH_TYPES.scope, payload: { ...scope, sequence: 7 } });
    handler.handleMessage({ type: GIT_WINDOW_PUSH_TYPES.scope, payload: { ...scope, sequence: 9, workspaceRoot: 4 } });
    expect(handler.scope()?.sequence).toBe(8);
    expect(store.applyWindowScope).toHaveBeenCalledTimes(1);
  });

  it('keeps mode changes host-owned and reports a rejected request', async () => {
    rpc.call.mockResolvedValue({ success: true, data: { accepted: false } });
    const context = TestBed.inject(GIT_WINDOW_CONTEXT);
    if (context.role !== 'child') throw new Error('Expected child context');
    expect(await context.setMode('pinned', 'tab')).toBe(false);
    expect(rpc.call).toHaveBeenCalledWith('gitWindow:setMode', { mode: 'pinned', tabId: 'tab' }, { timeout: 10_000 });
  });
});
