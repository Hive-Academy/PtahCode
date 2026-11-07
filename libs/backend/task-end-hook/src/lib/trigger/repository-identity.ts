/**
 * Repository identity of a seen workspace root (TASK_2026_886, plan
 * Component 4 "Repository identity").
 *
 * The identity is `realpath(resolve(root, stdout))` of
 * `git rev-parse --git-common-dir` (command table row 1) run from the root
 * through `ReadOnlyGit`. Every worktree of one repository shares the common
 * dir, so a task ended in a linked worktree and the same task seen in the main
 * checkout after a merge journal under one key (AC 1.3), while two
 * repositories with the same task id never collide (AC 1.5).
 *
 * A root that is not a git repository (exit 128 with no stdout) gets
 * `nogit:<realpath(root)>`. Any other failure is an `error` result: the
 * caller skips the root for this flush and a later flush retries, because
 * only `ok` results are cached.
 */
import * as path from 'node:path';
import type { ReadOnlyGit } from '../ports/read-only-git';
import { READ_ONLY_GIT_VECTORS } from '../ports/read-only-git';

/** `realpath`, injectable so specs can resolve paths without a disk. */
export type RealpathFn = (target: string) => Promise<string>;

/** Prefix of the identity of a root that is not inside a git repository. */
export const NOGIT_REPO_PREFIX = 'nogit:';

/**
 * Ceiling of one trigger-side git call. Shorter than the dispose probes'
 * `WORKTREE_GIT_TIMEOUT_MS`: flushes are serialised, and a slow call only
 * costs this flush (the next one retries).
 */
export const TRIGGER_GIT_TIMEOUT_MS = 30_000;
/** Output ceiling of `rev-parse --git-common-dir`. */
const COMMON_DIR_MAX_BYTES = 64 * 1024;
/** Exit code git uses for "not a git repository" (and other fatal errors). */
const GIT_FATAL_EXIT = 128;

export type RepositoryIdentity =
  /** Inside a git repository: `repoId` is the real common dir. */
  | { readonly kind: 'git'; readonly repoId: string }
  /** Not inside a git repository: `repoId` is `nogit:<rootRealPath>`. */
  | {
      readonly kind: 'nogit';
      readonly repoId: string;
      readonly rootRealPath: string;
    };

/** Closed failure codes; logged, never stored. */
export type RepositoryIdentityError =
  /** The runner rejected (timeout, abort, output limit, spawn failure). */
  | 'common-dir-git-failed'
  /** A non-zero exit other than "not a repository". */
  | 'common-dir-unexpected-exit'
  /** Exit 0 with no path on stdout. */
  | 'common-dir-empty'
  /** The reported common dir could not be resolved on disk. */
  | 'common-dir-realpath-failed'
  /** A non-repository root whose own real path could not be resolved. */
  | 'root-realpath-failed';

export type RepositoryIdentityResult =
  | { readonly kind: 'ok'; readonly identity: RepositoryIdentity }
  | { readonly kind: 'error'; readonly error: RepositoryIdentityError };

/** Strips the single line terminator git appends to a path. */
function firstLine(stdout: string): string {
  return stdout.replace(/\r?\n$/, '');
}

async function realpathOrNull(
  realpath: RealpathFn,
  target: string,
): Promise<string | null> {
  try {
    return await realpath(target);
  } catch {
    // degradation-audit: reported - every caller maps `null` to a closed
    // identity or main-root error code that it logs; never a pass.
    return null;
  }
}

/**
 * Derives and caches repository identities per root for the process
 * lifetime. A plain class built by the detector (same shape as `ReadOnlyGit`
 * over `GitReadRunner`, Decision D19); it holds no DI token.
 */
export class RepositoryIdentityResolver {
  private readonly cache = new Map<string, RepositoryIdentity>();

  constructor(
    private readonly git: ReadOnlyGit,
    private readonly realpath: RealpathFn,
  ) {}

  /**
   * The identity of `root` (an absolute path). A cached identity answers
   * without git; an `error` result is not cached, so the next call re-runs
   * the probe.
   */
  async resolve(
    root: string,
    signal?: AbortSignal,
  ): Promise<RepositoryIdentityResult> {
    const key = path.resolve(root);
    const cached = this.cache.get(key);
    if (cached !== undefined) return { kind: 'ok', identity: cached };

    const result = await this.probe(key, signal);
    if (result.kind === 'ok') this.cache.set(key, result.identity);
    return result;
  }

  private async probe(
    root: string,
    signal: AbortSignal | undefined,
  ): Promise<RepositoryIdentityResult> {
    let stdout: string;
    let exitCode: number;
    try {
      const result = await this.git.run(
        READ_ONLY_GIT_VECTORS.commonDir(),
        root,
        {
          timeoutMs: TRIGGER_GIT_TIMEOUT_MS,
          maxOutputBytes: COMMON_DIR_MAX_BYTES,
          ...(signal === undefined ? {} : { signal }),
        },
      );
      stdout = result.stdout;
      exitCode = result.exitCode;
    } catch {
      // The closed code is logged by the detector, which skips the root for
      // this flush; the next flush retries (errors are not cached).
      return { kind: 'error', error: 'common-dir-git-failed' };
    }

    const reported = firstLine(stdout);
    if (exitCode === GIT_FATAL_EXIT && reported.trim() === '') {
      const rootRealPath = await realpathOrNull(this.realpath, root);
      if (rootRealPath === null) {
        return { kind: 'error', error: 'root-realpath-failed' };
      }
      return {
        kind: 'ok',
        identity: {
          kind: 'nogit',
          repoId: `${NOGIT_REPO_PREFIX}${rootRealPath}`,
          rootRealPath,
        },
      };
    }
    if (exitCode !== 0) {
      return { kind: 'error', error: 'common-dir-unexpected-exit' };
    }
    if (reported === '') return { kind: 'error', error: 'common-dir-empty' };

    const commonDir = await realpathOrNull(
      this.realpath,
      path.resolve(root, reported),
    );
    if (commonDir === null) {
      return { kind: 'error', error: 'common-dir-realpath-failed' };
    }
    return { kind: 'ok', identity: { kind: 'git', repoId: commonDir } };
  }
}
