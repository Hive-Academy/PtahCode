import * as path from 'node:path';
import { assertSafeRef, GitInvalidRefError } from '@ptah-extension/vscode-core';
import type {
  GitReadResult,
  GitReadRunner,
  GitReadRunOptions,
} from './git-read-runner.port';

/**
 * Read-only git guard (TASK_2026_886, plan Component 8).
 *
 * Every git call the task-end hook makes goes through `ReadOnlyGit`, which
 * checks the whole argument vector against the closed allow-list in the plan's
 * "Disposal policy as implemented in this task" (command table rows 1-6)
 * BEFORE the runner spawns anything. Any other vector — `worktree remove`,
 * `worktree prune`, `fetch`, `branch -d`, `clean`, `stash`, a `-c` override,
 * an extra flag, a missing flag — throws `ReadOnlyGitViolation` and the runner
 * is never called. Row 7 (`gh pr list`) runs inside `GitInfoService`, not here.
 *
 * Matching is exact and positional: no prefix match, no option reordering, so
 * a vector cannot smuggle a mutating flag in after an allowed prefix.
 */

/** The only remote-tracking ref the merge checks read (C3: never fetched). */
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';
const BRANCH_REF_PREFIX = 'refs/heads/';
const COMMIT_PEEL_SUFFIX = '^{commit}';
/** A full object id: SHA-1 (40 hex) or SHA-256 (64 hex). */
const FULL_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Longest rendering of a rejected vector kept in the error message. */
const MAX_VECTOR_PREVIEW = 200;

/** Thrown, before any spawn, for a vector outside the read-only allow-list. */
export class ReadOnlyGitViolation extends Error {
  constructor(
    readonly args: readonly string[],
    reason: string,
  ) {
    super(`ReadOnlyGit refused ${previewVector(args)}: ${reason}`);
    this.name = 'ReadOnlyGitViolation';
  }
}

function previewVector(args: readonly string[]): string {
  const rendered = JSON.stringify(args);
  return rendered.length > MAX_VECTOR_PREVIEW
    ? `${rendered.slice(0, MAX_VECTOR_PREVIEW)}…`
    : rendered;
}

function sameVector(
  args: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    args.length === expected.length &&
    expected.every((value, index) => args[index] === value)
  );
}

/** Row 1: repository identity. */
const COMMON_DIR_VECTOR = ['rev-parse', '--git-common-dir'] as const;
/** Row 2: worktree list, NUL-separated. */
const WORKTREE_LIST_VECTOR = ['worktree', 'list', '--porcelain', '-z'] as const;
/** Row 3: P7 working-tree state, including ignored entries. */
const STATUS_VECTOR = [
  'status',
  '--porcelain=v1',
  '-z',
  '--untracked-files=all',
  '--ignored=matching',
] as const;
/** Row 4: does `origin/main` exist locally (as last fetched). */
const ORIGIN_MAIN_VECTOR = [
  'rev-parse',
  '--verify',
  '--quiet',
  ORIGIN_MAIN_REF,
] as const;
/** Row 5 prefix: the branch ref follows as the fifth element. */
const BRANCH_SHA_PREFIX = [
  'rev-parse',
  '--verify',
  '--quiet',
  '--end-of-options',
] as const;

/**
 * Validates a branch name for row 5. `assertSafeRef` refuses option-shaped,
 * malformed and `@{`-bearing names; its one exception, the stash ordinal
 * `stash@{N}`, is not a branch and is refused here as well.
 */
function assertSafeBranch(branch: string): void {
  assertSafeRef(branch);
  if (branch.includes('@{')) {
    throw new GitInvalidRefError(branch, 'is a reflog form, not a branch');
  }
}

function branchFromPeeledRef(ref: string | undefined): string | null {
  if (
    ref === undefined ||
    !ref.startsWith(BRANCH_REF_PREFIX) ||
    !ref.endsWith(COMMIT_PEEL_SUFFIX)
  ) {
    return null;
  }
  return ref.slice(
    BRANCH_REF_PREFIX.length,
    ref.length - COMMIT_PEEL_SUFFIX.length,
  );
}

/**
 * Throws `ReadOnlyGitViolation` unless `args` is exactly one of the six
 * allowed read-only vectors. Pure: spawns nothing.
 */
export function assertReadOnlyGitVector(args: readonly string[]): void {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new ReadOnlyGitViolation(
      Array.isArray(args) ? args.map(String) : [],
      'not an argument vector of strings',
    );
  }
  if (
    sameVector(args, COMMON_DIR_VECTOR) ||
    sameVector(args, WORKTREE_LIST_VECTOR) ||
    sameVector(args, STATUS_VECTOR) ||
    sameVector(args, ORIGIN_MAIN_VECTOR)
  ) {
    return;
  }

  if (
    args.length === BRANCH_SHA_PREFIX.length + 1 &&
    BRANCH_SHA_PREFIX.every((value, index) => args[index] === value)
  ) {
    const branch = branchFromPeeledRef(args[BRANCH_SHA_PREFIX.length]);
    if (branch === null) {
      throw new ReadOnlyGitViolation(
        args,
        `expected refs/heads/<branch>${COMMIT_PEEL_SUFFIX}`,
      );
    }
    try {
      assertSafeBranch(branch);
    } catch (error: unknown) {
      if (error instanceof GitInvalidRefError) {
        throw new ReadOnlyGitViolation(args, error.message);
      }
      throw error;
    }
    return;
  }

  if (
    args.length === 4 &&
    args[0] === 'merge-base' &&
    args[1] === '--is-ancestor' &&
    args[3] === ORIGIN_MAIN_REF
  ) {
    if (!FULL_OBJECT_ID.test(args[2] ?? '')) {
      throw new ReadOnlyGitViolation(
        args,
        'merge-base needs a full lowercase object id',
      );
    }
    return;
  }

  throw new ReadOnlyGitViolation(args, 'not in the read-only allow-list');
}

/**
 * Builders for the six allowed vectors, so callers never hand-type them. Each
 * result passes `assertReadOnlyGitVector`; `branchSha` and `isAncestorOfOriginMain`
 * validate their argument at the call.
 */
export const READ_ONLY_GIT_VECTORS = {
  commonDir: (): readonly string[] => [...COMMON_DIR_VECTOR],
  worktreeList: (): readonly string[] => [...WORKTREE_LIST_VECTOR],
  status: (): readonly string[] => [...STATUS_VECTOR],
  originMain: (): readonly string[] => [...ORIGIN_MAIN_VECTOR],
  branchSha: (branch: string): readonly string[] => {
    const vector = [
      ...BRANCH_SHA_PREFIX,
      `${BRANCH_REF_PREFIX}${branch}${COMMIT_PEEL_SUFFIX}`,
    ];
    assertReadOnlyGitVector(vector);
    return vector;
  },
  isAncestorOfOriginMain: (sha: string): readonly string[] => {
    const vector = ['merge-base', '--is-ancestor', sha, ORIGIN_MAIN_REF];
    assertReadOnlyGitVector(vector);
    return vector;
  },
} as const;

/**
 * The only caller of `GitReadRunner`. Checks the vector and the working
 * directory, then delegates; a refused call rejects with
 * `ReadOnlyGitViolation` and spawns nothing.
 */
export class ReadOnlyGit {
  constructor(private readonly runner: GitReadRunner) {}

  async run(
    args: readonly string[],
    cwd: string,
    options: GitReadRunOptions,
  ): Promise<GitReadResult> {
    assertReadOnlyGitVector(args);
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) {
      // A relative or empty cwd would run git in the process's own directory.
      throw new ReadOnlyGitViolation(args, 'cwd must be an absolute path');
    }
    return this.runner.run([...args], cwd, options);
  }
}
