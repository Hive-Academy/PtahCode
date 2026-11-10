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
    const scope: GitWindowScope = {
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
});
