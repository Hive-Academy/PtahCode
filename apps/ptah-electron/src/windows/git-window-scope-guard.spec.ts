import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitWindowScope } from '@ptah-extension/shared';
import { GitWindowScopeGuard } from './git-window-scope-guard';

/** PR #1038 review, finding 1: a link in the repository must not reach another repository. */
describe('GitWindowScopeGuard — symbolic links', () => {
  let base: string;
  let repoA: string;
  let repoB: string;
  let guard: GitWindowScopeGuard;
  let scope: GitWindowScope;

  beforeEach(() => {
    base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'git-window-guard-')));
    repoA = path.join(base, 'repo-a');
    repoB = path.join(base, 'repo-b');
    fs.mkdirSync(repoA);
    fs.mkdirSync(repoB);
    fs.writeFileSync(path.join(repoA, 'a.txt'), 'a');
    fs.writeFileSync(path.join(repoB, 'secret.txt'), 'b');
    // A junction needs no privilege on Windows; it is a directory link on other platforms.
    fs.symlinkSync(repoB, path.join(repoA, 'link'), 'junction');
    scope = {
      version: 1, sequence: 1, workspaceRoot: repoA, repoRoot: repoA, mode: 'follow-session',
      active: null, pinnedTabId: null, open: [], unresolved: false,
    };
    guard = new GitWindowScopeGuard(() => scope);
  });

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it.each(['file:viewContent', 'file:saveContent', 'editor:openFile'])(
    'refuses %s through a link that leaves the repository',
    (method) => {
      const linked = path.join(repoA, 'link', 'secret.txt');
      expect(guard.authorize(method, { path: linked, workspaceRoot: repoA })).toBe(false);
      expect(guard.authorize(method, { path: 'link/secret.txt', workspaceRoot: repoA })).toBe(false);
      expect(guard.authorize(method, { path: path.join(repoA, 'link', 'new.txt') })).toBe(false);
    },
  );

  it('accepts a real file and a new file of the repository', () => {
    expect(guard.authorize('file:viewContent', { path: path.join(repoA, 'a.txt') })).toBe(true);
    expect(guard.authorize('file:saveContent', { path: path.join(repoA, 'new', 'b.txt') })).toBe(true);
  });

  it('accepts a file whose name starts with two dots and refuses a parent step', () => {
    fs.writeFileSync(path.join(repoA, '..notes'), 'n');
    expect(guard.authorize('file:viewContent', { path: path.join(repoA, '..notes') })).toBe(true);
    expect(guard.authorize('file:viewContent', { path: '..notes', workspaceRoot: repoA })).toBe(true);
    expect(guard.authorize('file:viewContent', { path: '../repo-b/secret.txt', workspaceRoot: repoA })).toBe(false);
    expect(guard.authorize('file:viewContent', { path: path.join(repoA, '..') })).toBe(false);
  });

  it('refuses a new worktree through a link that leaves the repository', () => {
    const add = (target: string) => guard.authorize('git:addWorktree', { workspaceRoot: repoA, branch: 'f', path: target });
    expect(add(path.join(repoA, 'link', 'wt'))).toBe(false);
    expect(add('link/wt')).toBe(false);
    expect(add('../repo-b/wt')).toBe(false);
    expect(add(path.join(repoA, '.wt', 'f'))).toBe(true);
    expect(add('.wt/f')).toBe(true);
  });

  it('refuses the removal of a worktree through a link or outside the scope', () => {
    const remove = (target: string) => guard.authorize('git:removeWorktree', { workspaceRoot: repoA, path: target });
    expect(remove(path.join(repoA, 'link'))).toBe(false);
    expect(remove('link/wt')).toBe(false);
    expect(remove(repoB)).toBe(false);
    expect(remove(path.join(repoA, '.wt', 'f'))).toBe(true);
    // A worktree that the host listed for the repository can be removed.
    const sibling = path.join(base, 'repo-a-wt');
    expect(remove(sibling)).toBe(false);
    guard.observeResult('git:worktrees', { workspaceRoot: repoA }, { worktrees: [{ path: sibling }] });
    expect(remove(sibling)).toBe(true);
  });

  it('forwards the worktree push of a session of the scope for an adjacent worktree', () => {
    const candidate = {
      tabId: 't1', sessionId: 's-a', sessionName: 'a', organizationWorktreePath: null,
      organizationResolved: true, agentOriginWorktreePath: null, sessionCwd: repoA,
    };
    scope = { ...scope, active: candidate, open: [candidate, { ...candidate, tabId: 't2', sessionId: 's-b', sessionCwd: repoB }] };
    const push = (sessionId?: string) => ({
      type: 'git:worktreeChanged',
      payload: { action: 'created', path: path.join(base, 'repo-a-wt'), sessionId },
    });
    expect(guard.filterPush(push('s-a'))).toEqual(push('s-a'));
    expect(guard.filterPush(push('s-b'))).toBeNull();
    expect(guard.filterPush(push())).toBeNull();
  });
});
