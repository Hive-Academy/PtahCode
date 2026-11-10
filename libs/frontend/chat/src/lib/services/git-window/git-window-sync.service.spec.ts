import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, ElectronLayoutService, LoggingService, ThemeService, VSCodeService } from '@ptah-extension/core';
import { ChatGitSessionScopeSource } from '../session-git-scope/chat-git-session-scope.source';
import { GitWindowSync, boundedOpenSessions } from './git-window-sync.service';

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
  /** Runs at the start of the named RPC, to interleave a host push with awaited work. */
  let hooks: Record<string, (() => void) | undefined> = {};
  let restorePin: jest.Mock;
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
    hooks = {};
    restorePin = jest.fn((snapshot: ReturnType<typeof scope>) => scope.set(snapshot));
    panelVisible.set(true);
    layoutVisible = jest.fn((visible: boolean) => panelVisible.set(visible));
    TestBed.configureTestingModule({ providers: [
      GitWindowSync,
      { provide: ClaudeRpcService, useValue: { call: jest.fn(async (method: string, params: unknown) => {
        calls.push({ method, params });
        hooks[method]?.();
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
      { provide: GitDockScopeStore, useValue: { scope, pin: jest.fn(() => scope.set({ ...scope(), mode: 'pinned' })), unpin: jest.fn(() => scope.set({ ...scope(), mode: 'follow-session' })), showSession: jest.fn((tabId: string) => scope.set({ ...scope(), mode: 'pinned', session: { tabId } })), pinSnapshot: jest.fn(() => scope()), restorePin } },
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

  describe('PR #1038 review', () => {
    const publishes = () => calls.filter(c => c.method === 'gitWindow:publishScope');
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const retarget = async (tabId: string) => {
      active.set(candidate(tabId));
      open.set([candidate(tabId), candidate('A')]);
      TestBed.flushEffects();
      await wait(0);
    };

    it('keeps the active, pinned and same-root sessions when more than 100 are open (round 5)', async () => {
      const other = (tabId: string) => ({ ...candidate(tabId), sessionCwd: 'C:/other' });
      const many = Array.from({ length: 150 }, (_, index) => other(`T${index}`));
      // The needed sessions are after the bound in the source order.
      active.set(candidate('A'));
      open.set([...many, candidate('SAME'), other('P'), candidate('A')]);
      scope.set({ mode: 'pinned', root: 'C:/repo', unresolved: false, session: { tabId: 'P' } });
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      expect(sync.detached()).toBe(true);
      expect(sync.error()).toBeNull();
      const sent = (publishes().at(-1)?.params as { scope: { open: Array<{ tabId: string }> } }).scope.open;
      expect(sent).toHaveLength(100);
      expect(sent.slice(0, 3).map(c => c.tabId)).toEqual(['P', 'A', 'SAME']);
      expect(sent[3].tabId).toBe('T0');
      expect(boundedOpenSessions(many.slice(0, 100), ['x'], ['C:/repo'])).toHaveLength(100);
    });

    it('logs a rejected scope update and sends the unavailable scope to the child (round 5)', async () => {
      const logged = jest.spyOn(TestBed.inject(LoggingService), 'error').mockImplementation(() => undefined);
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      const before = publishes().length;
      // A session name over the IPC bound makes the scope not valid.
      active.set({ ...candidate('A'), sessionName: 'n'.repeat(600) });
      TestBed.flushEffects();
      await wait(0);
      expect(logged).toHaveBeenCalledWith('GitWindowSync', 'Git window scope update rejected', { issues: ['active.sessionName: too_big'] });
      expect(publishes()).toHaveLength(before + 1);
      expect(publishes().at(-1)?.params).toEqual({ scope: expect.objectContaining({ repoRoot: null, workspaceRoot: null, open: [], unresolved: true }) });
      expect(sync.error()).toBe('Git scope is unavailable');

      await retarget('B');
      expect(publishes().at(-1)?.params).toMatchObject({ scope: { repoRoot: 'C:/repo', active: { tabId: 'B' } } });
      expect(sync.error()).toBeNull();
    });

    it('retries a failed publish of the unavailable scope with no other scope change (round 6)', async () => {
      jest.spyOn(TestBed.inject(LoggingService), 'error').mockImplementation(() => undefined);
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      allowPublish = false;
      active.set({ ...candidate('A'), sessionName: 'n'.repeat(600) });
      TestBed.flushEffects();
      await wait(0);
      expect(sync.error()).toMatch(/Could not publish/);
      const failed = publishes().length;

      allowPublish = true;
      await wait(650);
      expect(publishes()).toHaveLength(failed + 1);
      expect(publishes().at(-1)?.params).toEqual({ scope: expect.objectContaining({ repoRoot: null, open: [], unresolved: true }) });
      expect(sync.error()).toBe('Git scope is unavailable');
    });

    it('keeps the rejected-scope error and sends the unavailable scope on Focus (round 6)', async () => {
      jest.spyOn(TestBed.inject(LoggingService), 'error').mockImplementation(() => undefined);
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      active.set({ ...candidate('A'), sessionName: 'n'.repeat(600) });
      TestBed.flushEffects();
      await wait(0);
      const before = publishes().length;

      await sync.focus();
      expect(publishes()).toHaveLength(before + 1);
      expect(publishes().at(-1)?.params).toEqual({ scope: expect.objectContaining({ repoRoot: null, unresolved: true }) });
      expect(sync.error()).toBe('Git scope is unavailable');
    });

    it('retries a failed scope publish with the newest scope while detached (finding 3)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      allowPublish = false;
      await retarget('B');
      expect(sync.error()).toMatch(/Could not publish/);
      const failed = publishes().length;

      allowPublish = true;
      await retarget('C');
      await wait(650);
      expect(publishes().length).toBeGreaterThan(failed);
      expect(publishes().at(-1)?.params).toMatchObject({ scope: { active: { tabId: 'C' } } });
      expect(sync.error()).toBeNull();
    });

    it('cancels the retry when the child closes (finding 3)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      allowPublish = false;
      await retarget('B');
      const failed = publishes().length;
      sync.handleMessage({ type: 'gitWindow:closed' });
      allowPublish = true;
      await wait(650);
      expect(publishes()).toHaveLength(failed);
      expect(sync.detached()).toBe(false);
    });

    it('republishes the unsent scope on Focus (finding 3)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      allowPublish = false;
      await retarget('B');
      allowPublish = true;
      await sync.focus();
      expect(publishes().at(-1)?.params).toMatchObject({ scope: { active: { tabId: 'B' } } });
      expect(sync.error()).toBeNull();
    });

    it('restores a pin to a closed tab when the follow-mode publish fails (finding 4)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      // Tab Z is pinned and closed: it is not in the open sessions, so showSession cannot restore it.
      const pinned = { mode: 'pinned' as const, root: 'C:/wt/z', unresolved: false, session: { tabId: 'Z' } };
      scope.set(pinned);
      TestBed.flushEffects();
      await wait(0);
      allowPublish = false;

      sync.handleMessage({ type: 'gitWindow:setMode', payload: { mode: 'follow-session', tabId: null } });
      await wait(0);

      expect(restorePin).toHaveBeenCalledWith(pinned);
      expect(scope()).toEqual(pinned);
      expect(sync.error()).toMatch(/Could not publish/);
    });

    it('stays docked when the child closes during an in-flight detach (finding 5)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await wait(0);
      hooks['gitWindow:publishScope'] = () => sync.handleMessage({ type: 'gitWindow:closed' });
      await sync.detach();
      expect(sync.detached()).toBe(false);
      expect(layoutVisible).not.toHaveBeenCalledWith(false);
      expect(calls.map(c => c.method)).toContain('gitWindow:status');
    });

    it('stays docked when the child closes during the reload restore (finding 5)', async () => {
      statusOpen = true;
      hooks['gitWindow:publishScope'] = () => {
        hooks = {};
        statusOpen = false;
        sync.handleMessage({ type: 'gitWindow:closed' });
      };
      sync = TestBed.inject(GitWindowSync);
      await wait(20);
      expect(sync.detached()).toBe(false);
      expect(layoutVisible).not.toHaveBeenCalledWith(false);
    });

    it('detaches and republishes when a stale closed push arrives but a child is open (finding 5)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await wait(0);
      statusOpen = true;
      hooks['gitWindow:publishScope'] = () => {
        hooks = {};
        sync.handleMessage({ type: 'gitWindow:closed' });
      };
      await sync.detach();
      expect(sync.detached()).toBe(true);
      expect(publishes()).toHaveLength(2);
    });

    it('publishes the scope again when Focus opens a child from a stale detached state (finding 5)', async () => {
      sync = TestBed.inject(GitWindowSync);
      await sync.detach();
      const before = publishes().length;
      await sync.focus();
      expect(publishes()).toHaveLength(before + 1);
    });
  });
});
