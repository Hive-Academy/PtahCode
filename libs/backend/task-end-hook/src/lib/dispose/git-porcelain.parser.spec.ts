import { parseGitStatusPorcelainZ } from './git-porcelain.parser';

/**
 * Captured verbatim from `git status --porcelain=v1 -z --untracked-files=all
 * --ignored=matching` (git 2.56.0) on a scratch repository under
 * `mktemp -d` with `.gitignore` = `node_modules/`, `*.log`, `build/`:
 * - `new-staged.txt` added to the index;
 * - `tracked.txt` renamed to `renamed.txt` with `git mv`, then modified;
 * - `nested/` an untracked nested repository;
 * - `sp ace ünï.txt` and `untracked file.txt` untracked;
 * - `build/sub/b.bin` and `node_modules/pkg/a.js` inside ignored directories;
 * - `emptyish/inner.log` an ignored file inside a non-ignored directory;
 * - `top.log` an ignored top-level file.
 * Ignored directories are single `!! dir/` entries, not expanded.
 */
const SCRATCH_REPO_FIXTURE =
  'A  new-staged.txt\0' +
  'RM renamed.txt\0tracked.txt\0' +
  '?? nested/\0' +
  '?? sp ace ünï.txt\0' +
  '?? untracked file.txt\0' +
  '!! build/\0' +
  '!! emptyish/inner.log\0' +
  '!! node_modules/\0' +
  '!! top.log\0';

describe('parseGitStatusPorcelainZ', () => {
  it('parses the scratch-repository fixture', () => {
    expect(parseGitStatusPorcelainZ(SCRATCH_REPO_FIXTURE)).toEqual({
      kind: 'ok',
      trackedChanges: 2,
      untrackedNonIgnored: 3,
      ignored: [
        { relPath: 'build', isDirectory: true },
        { relPath: 'emptyish/inner.log', isDirectory: false },
        { relPath: 'node_modules', isDirectory: true },
        { relPath: 'top.log', isDirectory: false },
      ],
    });
  });

  it('treats empty output as a clean worktree', () => {
    expect(parseGitStatusPorcelainZ('')).toEqual({
      kind: 'ok',
      trackedChanges: 0,
      untrackedNonIgnored: 0,
      ignored: [],
    });
  });

  it('reports only ignored entries as clean tracked state', () => {
    expect(parseGitStatusPorcelainZ('!! dist/\0!! .nx/\0')).toEqual({
      kind: 'ok',
      trackedChanges: 0,
      untrackedNonIgnored: 0,
      ignored: [
        { relPath: 'dist', isDirectory: true },
        { relPath: '.nx', isDirectory: true },
      ],
    });
  });

  it.each([
    [' M src/a.ts\0', 'unstaged modification'],
    ['M  src/a.ts\0', 'staged modification'],
    [' D gone.ts\0', 'unstaged deletion'],
    [' T link\0', 'type change'],
    ['UU conflict.ts\0', 'unmerged path'],
    ['AA both-added.ts\0', 'both added'],
    ['C  copy.ts\0orig.ts\0', 'copy with origin field'],
    [' R new.ts\0old.ts\0', 'worktree rename with origin field'],
  ])('counts %j as one tracked change (%s)', (output) => {
    const result = parseGitStatusPorcelainZ(output);
    expect(result).toMatchObject({ kind: 'ok', trackedChanges: 1 });
  });

  it('consumes the rename origin so it is not read as an entry', () => {
    // `old.ts` alone would be malformed; consumed as the origin it is fine.
    expect(parseGitStatusPorcelainZ('R  new.ts\0old.ts\0?? x\0')).toEqual({
      kind: 'ok',
      trackedChanges: 1,
      untrackedNonIgnored: 1,
      ignored: [],
    });
  });

  it('keeps paths with spaces and newlines verbatim (no quoting under -z)', () => {
    expect(parseGitStatusPorcelainZ('!! a b\nc.log\0')).toEqual({
      kind: 'ok',
      trackedChanges: 0,
      untrackedNonIgnored: 0,
      ignored: [{ relPath: 'a b\nc.log', isDirectory: false }],
    });
  });

  it.each([
    [' M a.ts', 'truncated-output'],
    ['?? a.ts\0?? b', 'truncated-output'],
    ['XY a.ts\0', 'malformed-entry'],
    ['   a.ts\0', 'malformed-entry'],
    ['M\0', 'malformed-entry'],
    ['MMa.ts\0', 'malformed-entry'],
    ['\0', 'malformed-entry'],
    ['R  new.ts\0', 'missing-origin-path'],
    ['R  new.ts\0\0', 'missing-origin-path'],
    ['?? /etc/passwd\0', 'unsafe-path'],
    ['!! ../outside/\0', 'unsafe-path'],
    ['!! a/./b\0', 'unsafe-path'],
    ['!! a//b\0', 'unsafe-path'],
    ['?? C:/x\0', 'unsafe-path'],
    ['?? a\\b\0', 'unsafe-path'],
    [' M ../x\0', 'unsafe-path'],
    ['R  new.ts\0../old.ts\0', 'unsafe-path'],
    ['!! /\0', 'unsafe-path'],
  ])('rejects %j as %s', (output, reason) => {
    expect(parseGitStatusPorcelainZ(output)).toEqual({ kind: 'error', reason });
  });

  it('is deterministic', () => {
    expect(parseGitStatusPorcelainZ(SCRATCH_REPO_FIXTURE)).toEqual(
      parseGitStatusPorcelainZ(SCRATCH_REPO_FIXTURE),
    );
  });
});
