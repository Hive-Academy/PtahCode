import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
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

  function linkWorktree(dir: string, pointer: string, backPointer = true): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.git'), `gitdir: ${pointer}\n`);
    const gitDir = resolve(dir, pointer);
    if (backPointer) {
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'gitdir'), `${join(dir, '.git').replace(/\\/g, '/')}\n`);
    }
  }

  it('returns null for a forged pointer that the main repository does not link back', () => {
    const real = join(main, '.claude-worktrees', 'wt');
    linkWorktree(real, join(main, '.git', 'worktrees', 'wt'));
    const forged = join(base, 'other-workspace');
    linkWorktree(forged, join(main, '.git', 'worktrees', 'wt'), false);
    expect(worktreeMainRoot(forged)).toBeNull();
  });

  it('accepts a worktree opened through a directory symlink or junction', () => {
    const wt = join(main, '.claude-worktrees', 'wt');
    linkWorktree(wt, join(main, '.git', 'worktrees', 'wt'));
    const alias = join(base, 'alias');
    symlinkSync(wt, alias, 'junction');
    expect(worktreeMainRoot(alias)).toBe(resolve(main));
  });

  it('returns null when the back-pointer file is missing', () => {
    const wt = join(base, 'no-back');
    linkWorktree(wt, join(main, '.git', 'worktrees', 'wt'), false);
    expect(worktreeMainRoot(wt)).toBeNull();
  });

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
