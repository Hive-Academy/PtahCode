/**
 * Main worktree root of a seen workspace root (TASK_2026_886, plan
 * Component 4 "Main worktree root", Decision A16).
 *
 * Git lists the main worktree first from any linked worktree, so the first
 * entry of `git worktree list --porcelain -z` (command table row 2), run from
 * the seen root, is the candidate. The candidate is accepted only when:
 *   - the listing parsed to at least one entry, and the first one is neither
 *     bare nor prunable;
 *   - its path is absolute and its `realpath` resolves;
 *   - `git rev-parse --git-common-dir` (row 1) from that real path gives the
 *     same repository identity as the seen root (also covers a relocated
 *     `.git`);
 *   - the seen root's real path is the candidate itself or a non-main entry
 *     of the same listing.
 * Any failed check gives `null` with a warn log naming the check code (no
 * path). A `nogit:` identity has no worktrees: the main root is
 * `realpath(seenRoot)`.
 *
 * The result does not depend on the main checkout being a registered
 * workspace folder. Only resolved roots are cached, so a git timeout or an
 * unexpected exit costs one flush and the next flush retries.
 */
import * as path from 'node:path';
import { parseWorktreeList } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ReadOnlyGit } from '../ports/read-only-git';
import { READ_ONLY_GIT_VECTORS } from '../ports/read-only-git';
import {
  TRIGGER_GIT_TIMEOUT_MS,
  type RealpathFn,
  type RepositoryIdentity,
  type RepositoryIdentityResolver,
} from './repository-identity';

/** Output ceiling of the worktree listing (same as the dispose probe). */
const WORKTREE_LIST_MAX_BYTES = 4 * 1024 * 1024;

/** Closed codes naming the check that rejected a candidate; logged only. */
export type MainRootCheck =
  | 'worktree-list-failed'
  | 'worktree-list-empty'
  | 'main-entry-bare'
  | 'main-entry-prunable'
  | 'main-path-not-absolute'
  | 'main-realpath-failed'
  | 'main-identity-unresolved'
  | 'main-identity-mismatch'
  | 'seen-root-realpath-failed'
  | 'seen-root-not-listed'
  | 'nogit-realpath-failed';

export type MainRootResolution =
  | { readonly kind: 'resolved'; readonly mainRoot: string }
  | { readonly kind: 'unresolved'; readonly check: MainRootCheck };

export interface MainRootResolverDeps {
  readonly git: ReadOnlyGit;
  /** Shared with the detector, so a registered main root costs no extra call. */
  readonly identities: RepositoryIdentityResolver;
  readonly realpath: RealpathFn;
  readonly logger: Pick<Logger, 'warn'>;
}

function unresolved(check: MainRootCheck): MainRootResolution {
  return { kind: 'unresolved', check };
}

/**
 * Plain class built by the detector beside the identity resolver (Decision
 * D19 shape); no DI token.
 */
export class MainRootResolver {
  private readonly cache = new Map<string, string>();

  constructor(private readonly deps: MainRootResolverDeps) {}

  /**
   * The validated main root of `seenRoot` (absolute), or `null`. `identity`
   * is the seen root's own identity, already resolved by the caller.
   */
  async resolve(
    seenRoot: string,
    identity: RepositoryIdentity,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const key = path.resolve(seenRoot);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const resolution =
      identity.kind === 'nogit'
        ? await this.resolveNoGit(key)
        : await this.resolveFromWorktrees(key, identity.repoId, signal);
    if (resolution.kind === 'unresolved') {
      this.deps.logger.warn('[task-end-hook] main root unresolved', {
        check: resolution.check,
      });
      return null;
    }
    this.cache.set(key, resolution.mainRoot);
    return resolution.mainRoot;
  }

  private async resolveNoGit(seenRoot: string): Promise<MainRootResolution> {
    const real = await this.realpathOrNull(seenRoot);
    return real === null
      ? unresolved('nogit-realpath-failed')
      : { kind: 'resolved', mainRoot: real };
  }

  private async resolveFromWorktrees(
    seenRoot: string,
    repoId: string,
    signal: AbortSignal | undefined,
  ): Promise<MainRootResolution> {
    let stdout: string;
    try {
      const result = await this.deps.git.run(
        READ_ONLY_GIT_VECTORS.worktreeList(),
        seenRoot,
        {
          timeoutMs: TRIGGER_GIT_TIMEOUT_MS,
          maxOutputBytes: WORKTREE_LIST_MAX_BYTES,
          ...(signal === undefined ? {} : { signal }),
        },
      );
      if (result.exitCode !== 0) return unresolved('worktree-list-failed');
      stdout = result.stdout;
    } catch {
      // Timeout, abort, output limit or spawn failure: `resolve` logs the
      // check and returns `null` for this flush only (not cached).
      return unresolved('worktree-list-failed');
    }

    const entries = parseWorktreeList(stdout);
    const candidate = entries[0];
    if (candidate === undefined) return unresolved('worktree-list-empty');
    if (candidate.isBare) return unresolved('main-entry-bare');
    if (candidate.prunable === true) return unresolved('main-entry-prunable');
    if (!path.isAbsolute(candidate.path)) {
      return unresolved('main-path-not-absolute');
    }
    const mainReal = await this.realpathOrNull(candidate.path);
    if (mainReal === null) return unresolved('main-realpath-failed');

    const mainIdentity = await this.deps.identities.resolve(mainReal, signal);
    if (mainIdentity.kind !== 'ok') {
      return unresolved('main-identity-unresolved');
    }
    if (
      mainIdentity.identity.kind !== 'git' ||
      mainIdentity.identity.repoId !== repoId
    ) {
      return unresolved('main-identity-mismatch');
    }

    const seenReal = await this.realpathOrNull(seenRoot);
    if (seenReal === null) return unresolved('seen-root-realpath-failed');
    if (seenReal === mainReal) return { kind: 'resolved', mainRoot: mainReal };
    for (const entry of entries.slice(1)) {
      if (!path.isAbsolute(entry.path)) continue;
      if ((await this.realpathOrNull(entry.path)) === seenReal) {
        return { kind: 'resolved', mainRoot: mainReal };
      }
    }
    return unresolved('seen-root-not-listed');
  }

  private async realpathOrNull(target: string): Promise<string | null> {
    try {
      return await this.deps.realpath(target);
    } catch {
      // degradation-audit: reported - each caller turns `null` into a named
      // MainRootCheck that `resolve` logs at warn; never a resolved root.
      return null;
    }
  }
}
