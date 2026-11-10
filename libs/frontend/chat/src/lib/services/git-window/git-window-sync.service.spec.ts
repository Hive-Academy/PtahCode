import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, ElectronLayoutService, ThemeService, VSCodeService } from '@ptah-extension/core';
import { ChatGitSessionScopeSource } from '../session-git-scope/chat-git-session-scope.source';
import { GitWindowSync } from './git-window-sync.service';

jest.mock('@pierre/diffs', () => ({}));
jest.mock('@pierre/diffs/worker', () => ({}));

const candidate = (tabId: string) => ({
  tabId, sessionId: tabId, sessionName: tabId,
  organizationWorktreePath: null, organizationResolved: true,
  agentOriginWorktreePath: null, sessionCwd: 'C:/repo',
});

describe('GitWindowSync', () => {
  const themeName = signal('ptah-glass');
  const active = signal(candidate('A'));
  const open = signal([candidate('A')]);
  const scope = signal({ mode: 'follow-session' as 'follow-session' | 'pinned', root: 'C:/repo', unresolved: false, session: { tabId: 'A' } });
  const calls: Array<{ method: string; params: unknown }> = [];
  let allowOpen = true;
  let allowPublish = true;
  let statusOpen = false;
  let layoutVisible: ReturnType<typeof jest.fn>;
  const panelVisible = signal(true);
  let sync: GitWindowSync;

  beforeEach(async () => {
    themeName.set('ptah-glass');
    const { GitDockScopeStore } = await import('@ptah-extension/git-ui/services');
    active.set(candidate('A'));
    open.set([candidate('A')]);
    scope.set({ mode: 'follow-session', root: 'C:/repo', unresolved: false, session: { tabId: 'A' } });
    calls.length = 0;
    allowOpen = true;
    allowPublish = true;
    statusOpen = false;
    panelVisible.set(true);
    layoutVisible = jest.fn((visible: boolean) => panelVisible.set(visible));
    TestBed.configureTestingModule({ providers: [
      GitWindowSync,
      { provide: ClaudeRpcService, useValue: { call: jest.fn(async (method: string, params: unknown) => {
        calls.push({ method, params });
        if (method === 'gitWindow:status') return { success: true, data: { open: statusOpen } };
        if (method === 'gitWindow:open') return { success: true, data: { ok: allowOpen } };
        if (method === 'gitWindow:close') return { success: true, data: { closed: true } };
        if (method === 'gitWindow:publishScope') return { success: true, data: { accepted: allowPublish, scope: allowPublish ? { ...(params as { scope: object }).scope, sequence: 1 } : null } };
        throw new Error(`Unexpected RPC: ${method}`);
      }) } },
      { provide: ElectronLayoutService, useValue: { activeWorkspace: signal({ path: 'C:/repo' }), editorPanelVisible: panelVisible, setEditorPanelVisible: layoutVisible } },
      { provide: VSCodeService, useValue: { isElectron: true } },
      { provide: ThemeService, useValue: { currentTheme: themeName } },
      { provide: ChatGitSessionScopeSource, useValue: { activeSession: active, openSessions: open, candidateForTab: (id: string) => open().find(c => c.tabId === id) ?? null } },
      { provide: GitDockScopeStore, useValue: { scope, pin: jest.fn(() => scope.set({ ...scope(), mode: 'pinned' })), unpin: jest.fn(() => scope.set({ ...scope(), mode: 'follow-session' })), showSession: jest.fn((tabId: string) => scope.set({ ...scope(), mode: 'pinned', session: { tabId } })) } },
    ] });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('publishes the theme of the main window and publishes again when it changes', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    expect(calls.filter(c => c.method === 'gitWindow:publishScope').at(-1)?.params).toMatchObject({ scope: { themeName: 'ptah-glass' } });
    themeName.set('ptah-glass-light');
    TestBed.flushEffects();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls.filter(c => c.method === 'gitWindow:publishScope')).toHaveLength(2);
    expect(calls.filter(c => c.method === 'gitWindow:publishScope').at(-1)?.params).toMatchObject({ scope: { themeName: 'ptah-glass-light' } });
  });

  it('opens and publishes before hiding, then focuses an existing window', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    expect(sync.detached()).toBe(true);
    expect(calls.map(c => c.method).filter(m => m !== 'gitWindow:status')).toEqual(['gitWindow:open', 'gitWindow:publishScope']);
    await sync.focus();
    expect(calls.filter(c => c.method === 'gitWindow:open')).toHaveLength(2);
  });

  it('keeps the dock visible when open fails', async () => {
    sync = TestBed.inject(GitWindowSync);
    allowOpen = false;
    await sync.detach();
    expect(sync.detached()).toBe(false);
    expect(calls.some(c => c.method === 'gitWindow:publishScope')).toBe(false);
  });

  it('closes a child whose initial scope publish fails', async () => {
    sync = TestBed.inject(GitWindowSync);
    allowPublish = false;
    await sync.detach();
    expect(sync.detached()).toBe(false);
    expect(calls.map(c => c.method)).toContain('gitWindow:close');
  });

  it('publishes session retargeting and validated mode pushes', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    active.set(candidate('B'));
    open.set([candidate('B'), candidate('A')]);
    TestBed.flushEffects();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls.filter(c => c.method === 'gitWindow:publishScope').at(-1)?.params).toMatchObject({ scope: { active: { tabId: 'B' } } });
    sync.handleMessage({ type: 'gitWindow:setMode', payload: { mode: 'pinned', tabId: 'B' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scope().mode).toBe('pinned');
    expect(calls.filter(c => c.method === 'gitWindow:publishScope').at(-1)?.params).toMatchObject({ scope: { mode: 'pinned' } });
  });

  it('restores the previous pinned mode when the child mode publish fails', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    scope.set({ ...scope(), mode: 'pinned', session: { tabId: 'A' } });
    TestBed.flushEffects();
    await new Promise(resolve => setTimeout(resolve, 0));
    allowPublish = false;

    sync.handleMessage({ type: 'gitWindow:setMode', payload: { mode: 'follow-session', tabId: null } });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sync.detached()).toBe(true);
    expect(scope().mode).toBe('pinned');
    expect(scope().session.tabId).toBe('A');
    expect(sync.error()).toMatch(/Could not publish/);
    expect(calls.filter(c => c.method === 'gitWindow:publishScope').at(-1)?.params)
      .toMatchObject({ scope: { mode: 'follow-session' } });
  });

  it('focuses the child when the session dock opener requests the panel', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    panelVisible.set(true);
    TestBed.flushEffects();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls.filter(c => c.method === 'gitWindow:open')).toHaveLength(2);
    expect(panelVisible()).toBe(false);
  });

  it('restores the dock on close push and attach', async () => {
    sync = TestBed.inject(GitWindowSync);
    await sync.detach();
    expect(sync.handledMessageTypes).toEqual(['gitWindow:closed', 'gitWindow:setMode']);
    sync.handleMessage({ type: 'gitWindow:closed' });
    expect(sync.detached()).toBe(false);
    expect(layoutVisible).toHaveBeenCalledWith(true);
    await sync.detach();
    await sync.attach();
    expect(sync.detached()).toBe(false);
  });

  it('rejects invalid mode and closed pushes', () => {
    sync = TestBed.inject(GitWindowSync);
    sync.handleMessage({ type: 'gitWindow:setMode', payload: { mode: 'pinned', tabId: null } });
    expect(scope().mode).toBe('follow-session');
    sync.handleMessage({ type: 'gitWindow:closed', payload: { unexpected: true } });
    expect(layoutVisible).not.toHaveBeenCalledWith(true);
  });

  it('republishes an open child scope after renderer reload', async () => {
    statusOpen = true;
    sync = TestBed.inject(GitWindowSync);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sync.detached()).toBe(true);
    expect(calls.map(c => c.method)).toContain('gitWindow:publishScope');
  });
});
