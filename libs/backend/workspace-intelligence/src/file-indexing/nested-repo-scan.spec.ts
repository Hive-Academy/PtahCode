import * as path from 'node:path';
import { WalkSlice } from './cooperative-yield';
import {
  collectDirectories,
  findNestedRepoAncestor,
  groupByDepth,
  unprobedCandidates,
} from './nested-repo-scan';

/**
 * review-10 finding 3: every synchronous pass of the nested-repository scan
 * must yield on its slice budget, including on one large flat level. A zero
 * budget makes every item an expired slice, so a pass that checks its slice
 * per item yields once per item.
 */
describe('nested-repo-scan', () => {
  const ROOT = '/ws';
  /** 2,000 directories, all at depth 0: one large flat level. */
  const FLAT_DIRS = Array.from({ length: 2000 }, (_, i) => `d${i}`);

  function spiedWalk(): { walk: WalkSlice; yields: jest.SpyInstance } {
    const walk = new WalkSlice(0);
    const yields = jest.spyOn(walk, 'yield');
    return { walk, yields };
  }

  it('collectDirectories yields while collecting a flat tree', async () => {
    const { walk, yields } = spiedWalk();
    const files = FLAT_DIRS.map((dir) => `${ROOT}/${dir}/index.ts`);

    const directories = await collectDirectories(ROOT, files, walk);

    expect(directories.size).toBe(FLAT_DIRS.length);
    expect(yields).toHaveBeenCalled();
  });

  it('groupByDepth yields while grouping one large flat level', async () => {
    const { walk, yields } = spiedWalk();

    const levels = await groupByDepth(new Set(FLAT_DIRS), walk);

    expect(levels).toHaveLength(1);
    expect(levels[0]).toHaveLength(FLAT_DIRS.length);
    expect(yields).toHaveBeenCalled();
  });

  it('unprobedCandidates yields while filtering one large flat level', async () => {
    const { walk, yields } = spiedWalk();
    const roots = new Set(['d1']);
    const level = FLAT_DIRS.map((dir) => `${dir}/inner`);

    const candidates = await unprobedCandidates(level, roots, walk);

    expect(candidates).toHaveLength(FLAT_DIRS.length - 1);
    expect(candidates).not.toContain('d1/inner');
    expect(yields).toHaveBeenCalled();
  });

  it('does not yield inside the budget', async () => {
    const walk = new WalkSlice(60_000);
    const yields = jest.spyOn(walk, 'yield');

    await groupByDepth(new Set(FLAT_DIRS.slice(0, 10)), walk);

    expect(yields).not.toHaveBeenCalled();
  });
});

describe('findNestedRepoAncestor', () => {
  const root = path.resolve('/ws');
  const repo = path.join(root, 'repo');
  const worktree = path.join(repo, 'worktree');
  const file = path.join(worktree, 'src', 'index.ts');
  const gitEntries = new Map([
    [path.join(root, '.git'), 'directory'],
    [path.join(repo, '.git'), 'directory'],
    [path.join(worktree, '.git'), 'file'],
  ]);

  it('finds a .git pointer file and prefers the closest ancestor', async () => {
    const exists = jest.fn(async (entry: string) => gitEntries.has(entry));
    await expect(findNestedRepoAncestor(root, file, exists)).resolves.toBe(worktree);
    expect(exists).not.toHaveBeenCalledWith(path.join(repo, '.git'));
  });

  it('finds an ancestor with a .git directory', async () => {
    const exists = async (entry: string) => gitEntries.has(entry);
    await expect(
      findNestedRepoAncestor(root, path.join(repo, 'src', 'index.ts'), exists),
    ).resolves.toBe(repo);
  });

  it('ignores the workspace root’s own .git entry', async () => {
    const exists = jest.fn(async (entry: string) => gitEntries.has(entry));
    await expect(
      findNestedRepoAncestor(root, path.join(root, 'src', 'index.ts'), exists),
    ).resolves.toBeNull();
    expect(exists).not.toHaveBeenCalledWith(path.join(root, '.git'));
  });

  it('does not probe paths outside the root', async () => {
    const exists = jest.fn(async () => true);
    await expect(
      findNestedRepoAncestor(root, `${root}-other/src/index.ts`, exists),
    ).resolves.toBeNull();
    expect(exists).not.toHaveBeenCalled();
  });

  it('continues past a rejected probe', async () => {
    const exists = async (entry: string) => {
      if (entry === path.join(worktree, '.git')) throw new Error('probe failed');
      return gitEntries.has(entry);
    };
    await expect(findNestedRepoAncestor(root, file, exists)).resolves.toBe(repo);
  });
});
