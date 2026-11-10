/**
 * GitDockScopeStore (TASK_2026_855): follow mode, pin/unpin, showSession,
 * closed pinned tabs, workspace removal, non-Electron behaviour, idempotent
 * fan-out, and the D21 tracking rule — an active-tab-only change re-targets
 * the five git services.
 */
import { computed, signal } from '@angular/core';
import { GIT_WINDOW_CONTEXT, type GitWindowContext } from '../git-window-context.token';
import type { GitWindowScope } from '@ptah-extension/shared';
import { TestBed } from '@angular/core/testing';
import {
  GIT_SESSION_SCOPE_SOURCE,
  VSCodeService,
  UnavailableGitRootsStore,
  type GitSessionScopeCandidate,
  type GitSessionScopeSource,
} from '@ptah-extension/core';
import { GitBranchesService } from './git-branches.service';
import { GitDockMutationGate } from './git-dock-mutation-gate';
import { GitDockScopeStore } from './git-dock-scope.store';
import { GitReviewService } from './git-review.service';
import { GitRootWatchLeaseService } from './git-root-watch-lease.service';
import { GitStatusService } from './git-status.service';
import { ReviewDiffService } from './review-diff.service';
import { ReviewNavigationService } from './review-navigation.service';

const WS = '/ws/repo';

function candidate(
  tabId: string,
  overrides: Partial<GitSessionScopeCandidate> = {},
): GitSessionScopeCandidate {
  return {
    tabId,
    sessionId: `session-${tabId}`,
    sessionName: `Session ${tabId}`,
    organizationWorktreePath: null,
    organizationResolved: true,
    agentOriginWorktreePath: null,
    sessionCwd: WS,
    ...overrides,
  };
}

describe('GitDockScopeStore', () => {
  /** Every switch/remove call across the five services, in call order. */
  let calls: string[];
  let leaseUpdates: (readonly (string | null)[])[];
  const isElectron = signal(true);
  const statusReason = signal<'root-unavailable' | null>(null);
  const statusActive = signal<string | null>(null);
  const tabs = signal<Record<string, GitSessionScopeCandidate>>({});
  const activeTabId = signal<string | null>(null);

  const source: GitSessionScopeSource = {
    activeSession: computed(() => {
      const id = activeTabId();
      return id === null ? null : (tabs()[id] ?? null);
    }),
    openSessions: computed(() => Object.values(tabs())),
    candidateForTab: (tabId: string) => tabs()[tabId] ?? null,
  };

  function fakeService(name: string) {
    return {
      statusUnavailable: () => statusReason(),
      activeWorkspacePath: () => statusActive(),
      switchWorkspace: jest.fn((root: string) => {
        // Like GitStatusService.switchWorkspace: the target root's own
        // status replaces the previous root's unavailable reason.
        if (name === 'status') {
          statusActive.set(root);
          statusReason.set(null);
        }
        calls.push(`${name}.switch:${root}`);
      }),
      removeWorkspaceState: jest.fn((root: string) =>
        calls.push(`${name}.remove:${root}`),
      ),
    };
  }

  function setup(withSource = true, windowContext?: GitWindowContext): GitDockScopeStore {
    calls = [];
    leaseUpdates = [];
    TestBed.configureTestingModule({
      providers: [
        ...(windowContext ? [{ provide: GIT_WINDOW_CONTEXT, useValue: windowContext }] : []),
        {
          provide: VSCodeService,
          useValue: {
            config: () => ({ isElectron: isElectron() }),
          },
        },
        { provide: GitStatusService, useValue: fakeService('status') },
        { provide: GitBranchesService, useValue: fakeService('branches') },
        { provide: ReviewDiffService, useValue: fakeService('diff') },
        { provide: GitReviewService, useValue: fakeService('review') },
        { provide: ReviewNavigationService, useValue: fakeService('nav') },
        {
          provide: GitRootWatchLeaseService,
          useValue: {
            update: (roots: readonly (string | null)[]) =>
              leaseUpdates.push(roots),
          },
        },
        ...(withSource
          ? [{ provide: GIT_SESSION_SCOPE_SOURCE, useValue: source }]
          : []),
      ],
    });
    return TestBed.inject(GitDockScopeStore);
  }

  const switches = (): string[] =>
    calls.filter((call) => call.includes('.switch:'));

  beforeEach(() => {
    statusReason.set(null);
    statusActive.set(null);
    isElectron.set(true);
    activeTabId.set(null);
    tabs.set({
      a: candidate('a', { organizationWorktreePath: '/wt/a' }),
      b: candidate('b', { agentOriginWorktreePath: '/wt/b' }),
      c: candidate('c'),
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('falls back to the session cwd after git refuses a removed worktree', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();
    expect(store.scope().root).toBe('/wt/a');
    statusReason.set('root-unavailable');
    TestBed.tick();
    expect(store.scope().root).toBe(WS);
    expect(store.scope().fallbackReason).toBe(
      'Worktree removed. Showing the main repository.',
    );
    activeTabId.set('b');
    TestBed.tick();
    expect(store.scope().fallbackReason).toBeUndefined();
    statusReason.set(null);
    TestBed.inject(UnavailableGitRootsStore).clear('/wt/a');
    activeTabId.set('a');
    TestBed.tick();
    expect(store.scope().root).toBe('/wt/a');
  });

  it('names the session folder when the cwd fallback is another worktree', () => {
    tabs.set({
      d: candidate('d', {
        organizationWorktreePath: '/wt/d',
        sessionCwd: '/wt/other',
      }),
    });
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('d');
    TestBed.tick();
    expect(store.scope().root).toBe('/wt/d');
    statusReason.set('root-unavailable');
    TestBed.tick();
    expect(store.scope().root).toBe('/wt/other');
    expect(store.scope().fallbackReason).toBe(
      'Worktree removed. Showing the session folder.',
    );
  });

  it('switches the five services in order when only the active tab changes (D21)', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();
    calls = [];

    // No workspace switch: only the active tab moves to a worktree session.
    activeTabId.set('a');
    TestBed.tick();

    expect(switches()).toEqual([
      'status.switch:/wt/a',
      'branches.switch:/wt/a',
      'diff.switch:/wt/a',
      'review.switch:/wt/a',
      'nav.switch:/wt/a',
    ]);
    expect(store.scope()).toEqual({
      mode: 'follow-session',
      root: '/wt/a',
      source: 'organization-worktree',
      session: { tabId: 'a', name: 'Session a', closed: false },
      isWorktree: true,
      unresolved: false,
    });
  });

  it('does not fan out again for the same root', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();
    calls = [];

    store.setWorkspace(WS);
    tabs.update((all) => ({ ...all, a: { ...all['a'], sessionName: 'x' } }));
    TestBed.tick();

    expect(switches()).toEqual([]);
  });

  it('shows an unresolved scope with mutations off while the session row is not loaded (S1)', () => {
    tabs.update((all) => ({
      ...all,
      u: candidate('u', { organizationResolved: false }),
    }));
    const store = setup();
    const gate = TestBed.inject(GitDockMutationGate);
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();
    calls = [];
    leaseUpdates = [];

    activeTabId.set('u');
    TestBed.tick();

    // No guess: the root is null, the services are not moved to the
    // workspace folder, and every mutation is refused.
    expect(store.scope()).toMatchObject({
      root: null,
      source: null,
      session: { tabId: 'u' },
      unresolved: true,
    });
    expect(switches()).toEqual([]);
    expect(gate.blockedReason()).not.toBeNull();
    expect(leaseUpdates.flat()).not.toContain(WS);

    // The row loads without a worktree: the session's cwd wins, writes resume.
    tabs.update((all) => ({
      ...all,
      u: { ...all['u'], organizationResolved: true },
    }));
    TestBed.tick();

    expect(store.scope()).toMatchObject({
      root: WS,
      source: 'session-cwd',
      unresolved: false,
    });
    expect(switches()[0]).toBe(`status.switch:${WS}`);
    expect(gate.blockedReason()).toBeNull();
  });

  it('uses the workspace folder for a tab with no worktree', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();

    expect(store.scope().root).toBe(WS);
    expect(store.scope().source).toBe('session-cwd');
    expect(store.scope().isWorktree).toBe(false);
  });

  it('keeps a pinned root across tab switches and follows again on unpin', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();

    store.pin();
    expect(store.mode()).toBe('pinned');
    calls = [];
    activeTabId.set('b');
    TestBed.tick();
    expect(switches()).toEqual([]);
    expect(store.scope().root).toBe('/wt/a');

    store.unpin();
    TestBed.tick();
    expect(store.mode()).toBe('follow-session');
    expect(store.scope().root).toBe('/wt/b');
    expect(switches()[0]).toBe('status.switch:/wt/b');
  });

  it('showSession on the active tab follows; on another tab pins without switching chat', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();

    store.showSession('b');
    expect(store.scope()).toMatchObject({
      mode: 'pinned',
      root: '/wt/b',
      source: 'agent-origin-worktree',
      session: { tabId: 'b', closed: false },
    });
    expect(activeTabId()).toBe('c');

    store.showSession('c');
    expect(store.mode()).toBe('follow-session');
    expect(store.scope().root).toBe(WS);
  });

  it('keeps the last root of a closed pinned tab, marked closed', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();
    store.showSession('a');
    TestBed.tick();
    calls = [];

    tabs.update((all) => {
      const next = { ...all };
      delete next['a'];
      return next;
    });
    TestBed.tick();

    expect(store.scope()).toMatchObject({
      mode: 'pinned',
      root: '/wt/a',
      session: { tabId: 'a', name: 'Session a', closed: true },
    });
    expect(switches()).toEqual([]);
  });

  it('tears the closed folder down in every service, clears its pin and releases the session root', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();
    store.showSession('a');
    calls = [];

    store.removeWorkspace(WS);

    expect(store.mode()).toBe('follow-session');
    expect(calls.filter((call) => call.includes('.remove:'))).toEqual([
      `status.remove:${WS}`,
      `branches.remove:${WS}`,
      `diff.remove:${WS}`,
      `review.remove:${WS}`,
      `nav.remove:${WS}`,
      'status.remove:/wt/a',
      'branches.remove:/wt/a',
      'diff.remove:/wt/a',
      'review.remove:/wt/a',
      'nav.remove:/wt/a',
    ]);
  });

  it('clears a pin made in another workspace on a workspace switch', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('c');
    TestBed.tick();
    store.showSession('a');

    store.setWorkspace('/ws/other');

    expect(store.mode()).toBe('follow-session');
  });

  it('always scopes to the workspace folder outside Electron and sends no lease', () => {
    isElectron.set(false);
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();

    expect(store.scope()).toEqual({
      mode: 'follow-session',
      root: WS,
      source: 'workspace-root',
      session: null,
      isWorktree: false,
      unresolved: false,
    });
    expect(switches()[0]).toBe(`status.switch:${WS}`);
    store.pin();
    store.showSession('b');
    expect(store.mode()).toBe('follow-session');
    expect(leaseUpdates).toEqual([]);
  });

  it('scopes to the workspace folder when no session source is provided', () => {
    const store = setup(false);
    store.setWorkspace(WS);
    TestBed.tick();

    expect(store.followsSessions()).toBe(false);
    expect(store.scope().root).toBe(WS);
  });

  it('leases the scope worktree first, then the other open session worktrees', () => {
    const store = setup();
    store.setWorkspace(WS);
    activeTabId.set('a');
    TestBed.tick();

    expect(store.scope().root).toBe('/wt/a');
    expect(leaseUpdates.at(-1)).toEqual(['/wt/a', '/wt/a', '/wt/b']);
  });

  it('applies validated child snapshots in sequence and keeps mode changes authoritative', async () => {
    const setMode = jest.fn(async () => false);
    const context: GitWindowContext = {
      role: 'child',
      applyCandidates: (scope) => {
        tabs.set(Object.fromEntries(scope.open.map((item) => [item.tabId, item])));
        activeTabId.set(scope.active?.tabId ?? null);
      },
      setMode,
    };
    const store = setup(true, context);
    const gate = TestBed.inject(GitDockMutationGate);
    expect(store.scope().unresolved).toBe(true);
    expect(gate.blockedReason()).not.toBeNull();
    const a: GitWindowScope = {
      version: 1, sequence: 1, workspaceRoot: WS, repoRoot: '/wt/a',
      mode: 'follow-session', active: candidate('a', { organizationWorktreePath: '/wt/a' }),
      pinnedTabId: null, open: [candidate('a', { organizationWorktreePath: '/wt/a' })], unresolved: false,
    };
    expect(store.applyWindowScope(a)).toBe(true);
    expect(store.scope().root).toBe('/wt/a');
    expect(store.scope().unresolved).toBe(false);
    expect(gate.blockedReason()).toBeNull();
    const b: GitWindowScope = {
      ...a, sequence: 2, repoRoot: '/wt/b', active: candidate('b', { agentOriginWorktreePath: '/wt/b' }),
      open: [candidate('b', { agentOriginWorktreePath: '/wt/b' }), ...a.open],
    };
    expect(store.applyWindowScope(b)).toBe(true);
    expect(store.scope().root).toBe('/wt/b');
    expect(store.applyWindowScope(a)).toBe(false);
    expect(store.scope().root).toBe('/wt/b');
    expect(store.applyWindowScope({ ...b, sequence: 3, mode: 'pinned', pinnedTabId: null })).toBe(false);
    expect(store.scope().root).toBe('/wt/b');
    const request = store.requestWindowMode(true);
    expect(setMode).toHaveBeenCalledWith('pinned', 'b');
    expect(store.mode()).toBe('follow-session');
    await request;
    expect(store.mode()).toBe('follow-session');
    expect(store.applyWindowScope({ ...b, sequence: 3, mode: 'pinned', pinnedTabId: 'b' })).toBe(true);
    expect(store.scope().session?.tabId).toBe('b');
    expect(store.mode()).toBe('pinned');
    expect(store.applyWindowScope({ ...b, sequence: 4 })).toBe(true);
    expect(store.mode()).toBe('follow-session');
    expect(store.applyWindowScope({ ...b, sequence: 5, mode: 'pinned', pinnedTabId: 'a', repoRoot: '/wt/a' })).toBe(true);
    expect(store.scope().session?.tabId).toBe('a');
    expect(store.mode()).toBe('pinned');
    expect(store.applyWindowScope({ ...b, sequence: 6, unresolved: true })).toBe(true);
    expect(gate.blockedReason()).not.toBeNull();
    expect(store.applyWindowScope({ ...b, sequence: 7, repoRoot: '/wrong' })).toBe(true);
    expect(gate.blockedReason()).not.toBeNull();
  });

  it('restores a closed pinned tab from the host root in a fresh child', () => {
    const context: GitWindowContext = {
      role: 'child',
      applyCandidates: (scope) => {
        tabs.set(Object.fromEntries(scope.open.map((item) => [item.tabId, item])));
        activeTabId.set(scope.active?.tabId ?? null);
      },
      setMode: jest.fn(async () => true),
    };
    const store = setup(true, context);
    const gate = TestBed.inject(GitDockMutationGate);
    const b = candidate('b', { agentOriginWorktreePath: '/wt/b' });
    const closed: GitWindowScope = {
      version: 1, sequence: 1, workspaceRoot: WS, repoRoot: '/wt/a',
      mode: 'pinned', active: b, pinnedTabId: 'a', open: [b], unresolved: false,
    };

    expect(store.applyWindowScope(closed)).toBe(true);
    expect(store.scope()).toMatchObject({
      mode: 'pinned', root: '/wt/a', unresolved: false,
      session: { tabId: 'a', closed: true },
    });
    expect(gate.blockedReason()).toBeNull();
    expect(switches()).toContain('status.switch:/wt/a');
    expect(store.applyWindowScope({ ...closed, sequence: 2, repoRoot: '/wt/a' })).toBe(true);
    expect(store.scope().root).toBe('/wt/a');
  });
});
