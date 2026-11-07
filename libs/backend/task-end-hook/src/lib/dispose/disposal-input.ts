/**
 * The complete input of the pure disposal decision (plan Component 6.3,
 * task-description AC 6.6).
 *
 * The collector (`DisposalInputCollector`) fills one record per candidate
 * worktree with read-only probes; `decideDisposal(record)` turns it into one
 * dispose outcome without any I/O. Every probe that can fail has an `error`
 * (or `unavailable`) member, so a failed probe reaches the precondition row
 * it belongs to instead of looking like a pass.
 */
import type {
  GitWorktreeInfo,
  TaskEndDisposeRequestedMode,
  TaskStatus,
} from '@ptah-extension/shared';

/**
 * Top-level directories whose ignored contents are regenerable and are never
 * archived or counted against the archive caps (C4).
 */
export const DISPOSAL_ARCHIVE_ALLOW_LIST: readonly string[] = [
  'node_modules/',
  'dist/',
  '.nx/',
  '.angular/',
  'coverage/',
];

/** P2: the task carrier, as read from `task.md` for this run. */
export type DisposalCarrier =
  | { readonly kind: 'ok'; readonly status: TaskStatus }
  | { readonly kind: 'unparseable' };

/**
 * P3: how this worktree is linked to the task, and which other non-terminal
 * tasks also claim it. `error` when the link sources could not be read.
 */
export type DisposalLinks =
  | {
      readonly kind: 'ok';
      /** (a) a linked session's organization row names this worktree. */
      readonly bySession: boolean;
      /** (b) the task id appears in the worktree folder or branch name. */
      readonly byName: boolean;
      /** (c) the task's `context.md` `## Worktree` line names this path. */
      readonly byContextLine: boolean;
      readonly otherNonTerminalTaskIds: readonly string[];
    }
  | { readonly kind: 'error' };

/** P4 and P6: this path's entry in `git worktree list --porcelain -z`. */
export type DisposalWorktreeEntry =
  | { readonly kind: 'listed'; readonly entry: GitWorktreeInfo }
  | { readonly kind: 'not-listed' }
  | { readonly kind: 'error' };

/**
 * P5: the candidate's real path, or, when its directory does not exist, the
 * real path of the nearest existing parent plus the lexical segments below it
 * (AC 4.10).
 */
export type DisposalPathResolution =
  | { readonly kind: 'resolved'; readonly realPath: string }
  | {
      readonly kind: 'missing';
      readonly nearestParentRealPath: string;
      readonly remainingSegments: readonly string[];
    }
  | { readonly kind: 'error' };

/** P7: counts from `git status --porcelain=v1 -z` in the candidate. */
export type DisposalPorcelain =
  | {
      readonly kind: 'ok';
      readonly trackedChanges: number;
      readonly untrackedNonIgnored: number;
    }
  | { readonly kind: 'error' };

/** One ignored file found under the candidate, relative to its root. */
export interface DisposalIgnoredFile {
  /** Relative path with `/` separators. */
  readonly relPath: string;
  readonly bytes: number;
}

/**
 * P7: ignored files with sizes. `truncated` when the bounded walk stopped at
 * `archiveMaxFiles + 1` entries or `archiveMaxBytes + 1` bytes.
 */
export type DisposalIgnoredFiles =
  | { readonly kind: 'ok'; readonly files: readonly DisposalIgnoredFile[] }
  | { readonly kind: 'truncated' }
  | { readonly kind: 'error' };

/** P7: whether the would-be archive destination already exists (stat only). */
export type DisposalArchiveDestination =
  | { readonly kind: 'absent' }
  | { readonly kind: 'exists' }
  | { readonly kind: 'error' };

/** P8: the branch tip against `refs/remotes/origin/main` as last fetched. */
export type DisposalMerge =
  | { readonly kind: 'ancestor' }
  | { readonly kind: 'not-ancestor' }
  | { readonly kind: 'unverified' };

/**
 * P9: open pull request for the branch. `not-queried` when the dry
 * evaluation already failed before P9, so `gh` was never asked.
 */
export type DisposalOpenPr =
  | { readonly kind: 'open' }
  | { readonly kind: 'none' }
  | { readonly kind: 'gh-unavailable' }
  | { readonly kind: 'error' }
  | { readonly kind: 'not-queried' };

/** P10: in-process activity (`activityScope: 'in-process'`). */
export type DisposalActivity =
  | {
      readonly kind: 'ok';
      /** Working directories of tracked CLI agent lanes. */
      readonly lanes: readonly string[];
      /** Workspace roots of live sessions. */
      readonly sessions: readonly string[];
      /** Registered Electron workspace roots. */
      readonly workspaces: readonly string[];
    }
  | { readonly kind: 'unavailable' };

/** P11: what the harvest step of this run recorded. */
export type DisposalHarvestOutcome =
  | 'harvested'
  | 'already-harvested'
  | 'no-carrier'
  | 'harvest-failed'
  | 'pending';

export interface DisposalInputRecord {
  /** The candidate worktree path as discovered (lexical, absolute). */
  readonly worktreePath: string;
  /** The `disposalMode` setting. */
  readonly requestedMode: TaskEndDisposeRequestedMode;
  /** Whether `auto` removal exists in this build. Never in this task (C1). */
  readonly autoReachable: false;
  /** A `cancelled` task never disposes (C2). */
  readonly cancelledPolicy: 'never';
  readonly carrier: DisposalCarrier;
  readonly links: DisposalLinks;
  readonly worktreeEntry: DisposalWorktreeEntry;
  /**
   * Whether the worktree directory exists. When it does not, P7 has nothing
   * to inspect and `porcelain`, `ignoredFiles` and `archiveDestination` are
   * not consulted.
   */
  readonly dirExists: boolean;
  readonly pathResolution: DisposalPathResolution;
  /** Real path of `run.mainRoot`; `null` when it could not be resolved. */
  readonly mainRealPath: string | null;
  /** Real path of `<main>/.claude-worktrees/`; `null` when unresolved. */
  readonly agentDirRealPath: string | null;
  readonly porcelain: DisposalPorcelain;
  readonly ignoredFiles: DisposalIgnoredFiles;
  /** Normally `DISPOSAL_ARCHIVE_ALLOW_LIST`; entries end with `/`. */
  readonly allowList: readonly string[];
  /** Archive byte cap (setting). */
  readonly archiveMaxBytes: number;
  /** Archive file-count cap (setting). */
  readonly archiveMaxFiles: number;
  readonly archiveDestination: DisposalArchiveDestination;
  readonly merge: DisposalMerge;
  readonly openPr: DisposalOpenPr;
  readonly activity: DisposalActivity;
  readonly harvestOutcome: DisposalHarvestOutcome;
  /**
   * Codes of probes that failed or timed out (no text). A non-empty list
   * never passes: when every precondition holds otherwise, the decision is
   * `precondition-unverifiable`.
   */
  readonly probeErrors: readonly string[];
}
