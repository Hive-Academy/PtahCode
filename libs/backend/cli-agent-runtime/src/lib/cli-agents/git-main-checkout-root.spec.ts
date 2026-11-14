import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { worktreeMainRoot } from './git-main-checkout-root';

describe('worktreeMainRoot', () => {
  let base: string;
  let main: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'git-main-root-'));
    main = join(base, 'repo');
    mkdirSync(join(main, '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileSync(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  function linkWorktree(dir: string, pointer: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.git'), `gitdir: ${pointer}\n`);
  }

  it('returns the main checkout for a linked worktree with an absolute gitdir', () => {
    const wt = join(main, '.claude-worktrees', 'wt');
    linkWorktree(wt, join(main, '.git', 'worktrees', 'wt').replace(/\\/g, '/'));
    expect(worktreeMainRoot(wt)).toBe(resolve(main));
  });

  it('resolves a relative gitdir against the worktree folder', () => {
    const wt = join(base, 'sibling-wt');
    linkWorktree(wt, '../repo/.git/worktrees/wt');
    expect(worktreeMainRoot(wt)).toBe(resolve(main));
  });

  it('walks up from a nested folder of the worktree', () => {
    const wt = join(main, '.claude-worktrees', 'wt');
    linkWorktree(wt, join(main, '.git', 'worktrees', 'wt'));
    const nested = join(wt, 'libs', 'a');
    mkdirSync(nested, { recursive: true });
    expect(worktreeMainRoot(nested)).toBe(resolve(main));
  });

  it('returns null for the main checkout itself', () => {
    expect(worktreeMainRoot(main)).toBeNull();
  });

  it('returns null for a submodule-style pointer with no commondir', () => {
    const gitDir = join(base, 'modules', 'sub');
    mkdirSync(gitDir, { recursive: true });
    const sub = join(base, 'sub');
    linkWorktree(sub, gitDir);
    expect(worktreeMainRoot(sub)).toBeNull();
  });

  it('returns null for a .git file without a gitdir line', () => {
    const wt = join(base, 'broken');
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, '.git'), 'not a pointer\n');
    expect(worktreeMainRoot(wt)).toBeNull();
  });
});
