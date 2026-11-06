/**
 * Read-only probes that fill one `DisposalInputRecord` per candidate worktree
 * (plan Component 6.3, "Candidate discovery" and "Collector rules").
 *
 * The collector deletes, moves, archives and writes nothing (C1). Every git
 * call goes through `ReadOnlyGit` with a `READ_ONLY_GIT_VECTORS` builder; the
 * filesystem is touched only with `realpath`, `lstat`, `readdir` and bounded
 * `readFile`. A probe that fails or times out never looks like a pass: it
 * becomes the record's `error`/`unavailable` member and a code in
 * `probeErrors`, which the pure decision maps to `precondition-unverifiable`
 * (or `in-use-unverifiable`).
 *
 * "Main worktree" always means `run.mainRoot` (Decision A16): rows 2, 4, 5, 6
 * and 7 of the command table run with `cwd = run.mainRoot`, never in a
 * registered workspace folder. A run without a main root is never surveyed.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AGENT_WORKTREE_DIR,
  parseWorktreeList,
  type GitWorktreeInfo,
  type TaskEndDisposeRequestedMode,
  type TaskEndRunRecord,
  type TaskStatus,
} from '@ptah-extension/shared';
import { TASK_ID_PATTERN } from '@ptah-extension/shared/schemas';
import { parseTaskFile } from '@ptah-extension/task-specs';
import {
  WORKTREE_GIT_TIMEOUT_MS,
  type Logger,
} from '@ptah-extension/vscode-core';
import type { ActivityPort } from '../ports/activity.port';
import type { PrStatusPort } from '../ports/pr-status.port';
import {
  READ_ONLY_GIT_VECTORS,
  type ReadOnlyGit,
} from '../ports/read-only-git';
import type { SessionLinkPort } from '../ports/session-link.port';
import { decideDisposal } from './decide-disposal';
import {
  DISPOSAL_ARCHIVE_ALLOW_LIST,
  type DisposalActivity,
  type DisposalArchiveDestination,
  type DisposalCarrier,
  type DisposalHarvestOutcome,
  type DisposalIgnoredFile,
  type DisposalIgnoredFiles,
  type DisposalInputRecord,
  type DisposalLinks,
  type DisposalMerge,
  type DisposalOpenPr,
  type DisposalPathResolution,
  type DisposalPorcelain,
  type DisposalWorktreeEntry,
} from './disposal-input';
import {
  parseGitStatusPorcelainZ,
  type GitIgnoredEntry,
} from './git-porcelain.parser';

/** Codes recorded in `probeErrors`; never free text (AC 6.6). */
export const DISPOSAL_PROBE_ERRORS = {
  mainRootUnresolved: 'main-root-unresolved',
  mainRealPath: 'main-realpath-failed',
  agentDirRealPath: 'agent-dir-realpath-failed',
  worktreeList: 'worktree-list-failed',
  sessionLinks: 'session-links-unavailable',
  worktreeName: 'worktree-name-failed',
  contextLine: 'context-line-unreadable',
  otherTasks: 'other-task-links-unreadable',
  pathResolution: 'path-resolution-failed',
  status: 'status-failed',
  ignoredWalk: 'ignored-walk-failed',
  archiveDestination: 'archive-destination-unreadable',
  originMain: 'origin-main-probe-failed',
  branchSha: 'branch-sha-probe-failed',
  mergeBase: 'merge-base-probe-failed',
  prStatus: 'pr-status-failed',
  activity: 'activity-unavailable',
} as const;

export type DisposalProbeError =
  (typeof DISPOSAL_PROBE_ERRORS)[keyof typeof DISPOSAL_PROBE_ERRORS];

/** The P3 source a candidate was discovered by. */
export type DisposalLinkSource = 'session' | 'name' | 'context-line';

/** One discovered worktree, de-duplicated by real (or lexical) path. */
export interface DisposalCandidate {
  /** The path as first discovered (lexical, absolute): the step subject. */
  readonly worktreePath: string;
  /** Real path, or the resolved lexical path when the directory is missing. */
  readonly key: string;
  readonly sources: ReadonlySet<DisposalLinkSource>;
}

/** Settings the record carries, from the Batch 4 snapshot. */
export interface DisposalCollectorSettings {
  readonly requestedMode: TaskEndDisposeRequestedMode;
  readonly archiveMaxBytes: number;
  readonly archiveMaxFiles: number;
}

/** A run whose main root was derived and validated. */
export type DisposalSurveyRun = TaskEndRunRecord & {
  readonly mainRoot: string;
};

/** Run-level facts, gathered once and shared by every candidate. */
export interface DisposalRunSurvey {
  readonly run: DisposalSurveyRun;
  /** Discovery order: (a) session rows, (b) worktree list, (c) context line. */
  readonly candidates: readonly DisposalCandidate[];
  /**
   * `false` when a link source could not be read, so the candidate list (and
   * every candidate's `links`) may be incomplete. Zero candidates then means
   * "unknown", not `no-linked-worktree`.
   */
  readonly linksComplete: boolean;
  readonly carrier: DisposalCarrier;
  readonly listing: WorktreeListing;
  readonly mainRealPath: string | null;
  readonly agentDirRealPath: string | null;
  readonly otherTasks: OtherTaskIndex;
  readonly activity: DisposalActivity;
  readonly harvestOutcome: DisposalHarvestOutcome;
  readonly probeErrors: readonly DisposalProbeError[];
  /** Row 4 once per run; `not-probed` when there is no candidate to check. */
  readonly originMain: OriginMainState;
}

export interface DisposalCollectorDeps {
  readonly git: ReadOnlyGit;
  readonly sessionLinks: SessionLinkPort;
  readonly activity: ActivityPort;
  readonly prStatus: PrStatusPort;
  readonly logger: Pick<Logger, 'debug'>;
  /**
   * Root of the would-be archive destinations (stat only, never created).
   * Defaults to `~/.ptah/archive/worktrees`.
   */
  readonly archiveRoot?: string;
}

type WorktreeListing =
  | {
      readonly kind: 'ok';
      readonly entries: readonly {
        readonly entry: GitWorktreeInfo;
        readonly key: string;
      }[];
    }
  | { readonly kind: 'error' };

/** Other non-terminal tasks, with the worktree keys each one claims. */
type OtherTaskIndex =
  | {
      readonly kind: 'ok';
      /** Task id → path keys claimed by its session rows and context line. */
      readonly claims: ReadonlyMap<string, ReadonlySet<string>>;
    }
  | { readonly kind: 'error' };

type OriginMainState = 'present' | 'absent' | 'error' | 'not-probed';

/** Bounded reads: carriers and context files are small text files. */
const MAX_SPEC_FILE_BYTES = 1024 * 1024;
/** Spec folders scanned per root for other tasks' claims. */
const MAX_SPEC_FOLDERS = 10_000;
/** `git worktree list` output ceiling. */
const WORKTREE_LIST_MAX_BYTES = 4 * 1024 * 1024;
/** `git status` output ceiling; a larger listing is unverifiable. */
const STATUS_MAX_BYTES = 16 * 1024 * 1024;
/** Output ceiling of the small `rev-parse` / `merge-base` probes. */
const REF_PROBE_MAX_BYTES = 64 * 1024;
const FULL_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DETACHED_BRANCHES: ReadonlySet<string> = new Set([
  'HEAD',
  'HEAD (detached)',
]);
const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'done',
  'cancelled',
]);
/** Length of the real-path hash in the archive slug (P7). */
const SLUG_HASH_LENGTH = 12;

export class DisposalInputCollector {
  private readonly archiveRoot: string;

  constructor(private readonly deps: DisposalCollectorDeps) {
    this.archiveRoot =
      deps.archiveRoot ??
      path.join(os.homedir(), '.ptah', 'archive', 'worktrees');
  }

  /**
   * Gathers the run-level facts and discovers the candidates (P3 sources a,
   * b, c). Every probe here is read-only; a failure is folded into the
   * survey, so this rejects only when `signal` aborts a git call.
   */
  async survey(
    run: DisposalSurveyRun,
    signal: AbortSignal,
  ): Promise<DisposalRunSurvey> {
    const probeErrors: DisposalProbeError[] = [];
    const keys = new PathKeyCache();
    const roots = linkRoots(run);

    const listing = await this.listWorktrees(run.mainRoot, keys, signal);
    if (listing.kind === 'error')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.worktreeList);

    const mainRealPath = await realpathOrNull(run.mainRoot);
    if (mainRealPath === null)
      probeErrors.push(DISPOSAL_PROBE_ERRORS.mainRealPath);
    const agentDirRealPath = await realpathOrNull(
      path.join(run.mainRoot, AGENT_WORKTREE_DIR),
    );
    if (agentDirRealPath === null)
      probeErrors.push(DISPOSAL_PROBE_ERRORS.agentDirRealPath);

    const carrier = await readCarrier(run.seenRoot, run.taskId);

    const found = new CandidateSet(keys);
    let linksComplete = listing.kind === 'ok';

    // (a) the worktree path on each linked session's organization row.
    try {
      for (const sessionId of this.deps.sessionLinks.linkedSessions(
        run.taskId,
        roots,
      )) {
        const worktreePath = this.deps.sessionLinks.worktreePathForSession(
          sessionId,
          roots,
        );
        if (worktreePath !== null && path.isAbsolute(worktreePath)) {
          await found.add(worktreePath, 'session');
        }
      }
    } catch (error: unknown) {
      // The organization store is unavailable: links stay unverifiable.
      linksComplete = false;
      probeErrors.push(DISPOSAL_PROBE_ERRORS.sessionLinks);
      this.debug('session links unavailable', run, error);
    }

    // (b) worktrees whose folder or branch name contains the task id.
    if (listing.kind === 'ok') {
      try {
        for (const { entry } of listing.entries) {
          if (entry.isMain || entry.isBare) continue;
          const ids = this.deps.sessionLinks.taskIdsInWorktreeName(
            entry.path,
            branchOf(entry),
          );
          if (ids.includes(run.taskId)) await found.add(entry.path, 'name');
        }
      } catch (error: unknown) {
        // The naming rule threw: name links cannot be proved either way.
        linksComplete = false;
        probeErrors.push(DISPOSAL_PROBE_ERRORS.worktreeName);
        this.debug('worktree name rule failed', run, error);
      }
    }

    // (c) the `## Worktree` line of this task's context.md.
    const contextLine = await readContextWorktreeLine(run.seenRoot, run.taskId);
    if (contextLine.kind === 'error') {
      linksComplete = false;
      probeErrors.push(DISPOSAL_PROBE_ERRORS.contextLine);
    } else if (contextLine.path !== null) {
      await found.add(contextLine.path, 'context-line');
    }

    const otherTasks = await this.indexOtherTasks(run, roots, keys);
    if (otherTasks.kind === 'error')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.otherTasks);

    const activity = this.readActivity();
    if (activity.kind === 'unavailable')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.activity);

    const candidates = found.list();
    const originMain =
      candidates.length === 0
        ? 'not-probed'
        : await this.probeOriginMain(run.mainRoot, signal);
    if (originMain === 'error')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.originMain);

    return {
      run,
      candidates,
      linksComplete,
      carrier,
      listing,
      mainRealPath,
      agentDirRealPath,
      otherTasks,
      activity,
      harvestOutcome: harvestOutcomeOf(run),
      probeErrors,
      originMain,
    };
  }

  /**
   * Fills the record for one candidate. All local probes run; `gh` is asked
   * only when a dry evaluation already passes P2 to P8, otherwise `openPr`
   * is `not-queried`. Rejects only when `signal` aborts a git call.
   */
  async collect(
    survey: DisposalRunSurvey,
    worktreePath: string,
    settings: DisposalCollectorSettings,
    signal: AbortSignal,
  ): Promise<DisposalInputRecord> {
    const probeErrors: DisposalProbeError[] = [...survey.probeErrors];
    const keys = new PathKeyCache();
    const key = await keys.of(worktreePath);
    const listed =
      survey.listing.kind === 'ok'
        ? survey.listing.entries.find((item) => item.key === key)
        : undefined;
    const worktreeEntry: DisposalWorktreeEntry =
      survey.listing.kind === 'error'
        ? { kind: 'error' }
        : listed === undefined
          ? { kind: 'not-listed' }
          : { kind: 'listed', entry: listed.entry };
    const branch = listed === undefined ? null : branchOf(listed.entry);

    const links = this.linksFor(
      survey,
      worktreePath,
      key,
      listed?.entry ?? null,
      probeErrors,
    );

    const resolved = await resolveCandidatePath(worktreePath);
    if (resolved.resolution.kind === 'error')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.pathResolution);

    let porcelain: DisposalPorcelain = { kind: 'error' };
    let ignoredFiles: DisposalIgnoredFiles = { kind: 'error' };
    let archiveDestination: DisposalArchiveDestination = { kind: 'error' };
    // A missing directory has nothing for P7 to inspect: the three P7 fields
    // stay `error` and are not consulted (decideDisposal skips P7).
    if (resolved.dirExists && resolved.resolution.kind === 'resolved') {
      const realPath = resolved.resolution.realPath;
      const status = await this.readStatus(realPath, signal);
      if (status.kind === 'ok') {
        porcelain = {
          kind: 'ok',
          trackedChanges: status.trackedChanges,
          untrackedNonIgnored: status.untrackedNonIgnored,
        };
        ignoredFiles = await walkIgnored(realPath, status.ignored, settings);
        if (ignoredFiles.kind === 'error')
          probeErrors.push(DISPOSAL_PROBE_ERRORS.ignoredWalk);
      } else {
        probeErrors.push(DISPOSAL_PROBE_ERRORS.status);
      }
      archiveDestination = await this.archiveDestinationOf(
        survey.run,
        realPath,
      );
      if (archiveDestination.kind === 'error') {
        probeErrors.push(DISPOSAL_PROBE_ERRORS.archiveDestination);
      }
    }

    const merge = await this.mergeState(survey, branch, probeErrors, signal);

    const record: DisposalInputRecord = {
      worktreePath,
      requestedMode: settings.requestedMode,
      autoReachable: false,
      cancelledPolicy: 'never',
      carrier: survey.carrier,
      links,
      worktreeEntry,
      dirExists: resolved.dirExists,
      pathResolution: resolved.resolution,
      mainRealPath: survey.mainRealPath,
      agentDirRealPath: survey.agentDirRealPath,
      porcelain,
      ignoredFiles,
      allowList: DISPOSAL_ARCHIVE_ALLOW_LIST,
      archiveMaxBytes: settings.archiveMaxBytes,
      archiveMaxFiles: settings.archiveMaxFiles,
      archiveDestination,
      merge,
      openPr: { kind: 'not-queried' },
      activity: survey.activity,
      harvestOutcome: survey.harvestOutcome,
      probeErrors,
    };

    if (branch === null || !passesThroughP8(record)) return record;

    const openPr = await this.queryOpenPr(survey.run, branch);
    if (openPr.kind === 'error')
      probeErrors.push(DISPOSAL_PROBE_ERRORS.prStatus);
    return { ...record, openPr, probeErrors };
  }

  // -------------------------------------------------------------------------
  // Run-level probes
  // -------------------------------------------------------------------------

  /** Row 2 from the main root: the main entry first, then every worktree. */
  private async listWorktrees(
    mainRoot: string,
    keys: PathKeyCache,
    signal: AbortSignal,
  ): Promise<WorktreeListing> {
    const result = await this.runGit(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      mainRoot,
      WORKTREE_LIST_MAX_BYTES,
      signal,
    );
    if (result === null || result.exitCode !== 0) return { kind: 'error' };
    const entries: { entry: GitWorktreeInfo; key: string }[] = [];
    for (const entry of parseWorktreeList(result.stdout)) {
      if (!path.isAbsolute(entry.path)) return { kind: 'error' };
      entries.push({ entry, key: await keys.of(entry.path) });
    }
    return entries.length === 0 ? { kind: 'error' } : { kind: 'ok', entries };
  }

  /**
   * Other non-terminal tasks in the run's roots and the worktrees they claim
   * through a linked session row or their own `## Worktree` line. A carrier
   * that cannot be parsed counts as non-terminal: it cannot be proved ended.
   */
  private async indexOtherTasks(
    run: DisposalSurveyRun,
    roots: readonly string[],
    keys: PathKeyCache,
  ): Promise<OtherTaskIndex> {
    const claims = new Map<string, Set<string>>();
    try {
      for (const root of roots) {
        const specsDir = path.join(root, '.ptah', 'specs');
        const folders = await readdirOrEmpty(specsDir);
        if (folders.length > MAX_SPEC_FOLDERS) return { kind: 'error' };
        for (const folder of folders) {
          if (folder === run.taskId || !TASK_ID_PATTERN.test(folder)) continue;
          const carrier = await readCarrierFile(
            path.join(specsDir, folder, 'task.md'),
            folder,
          );
          if (carrier === 'absent') continue;
          if (carrier !== 'unparseable' && TERMINAL_TASK_STATUSES.has(carrier))
            continue;
          const claimed = claims.get(folder) ?? new Set<string>();
          claims.set(folder, claimed);
          const line = await readContextWorktreeLine(root, folder);
          if (line.kind === 'error') return { kind: 'error' };
          if (line.path !== null) claimed.add(await keys.of(line.path));
        }
      }
      for (const [taskId, claimed] of claims) {
        for (const sessionId of this.deps.sessionLinks.linkedSessions(
          taskId,
          roots,
        )) {
          const worktreePath = this.deps.sessionLinks.worktreePathForSession(
            sessionId,
            roots,
          );
          if (worktreePath !== null && path.isAbsolute(worktreePath)) {
            claimed.add(await keys.of(worktreePath));
          }
        }
      }
    } catch (error: unknown) {
      // A spec folder or the organization store could not be read: another
      // task's claim cannot be ruled out, so P3 stays unverifiable.
      this.debug('other-task links unreadable', run, error);
      return { kind: 'error' };
    }
    return { kind: 'ok', claims };
  }

  /** P10 inputs, once per run; any unavailable probe makes it unavailable. */
  private readActivity(): DisposalActivity {
    try {
      const lanes = this.deps.activity.trackedLaneDirs();
      const sessions = this.deps.activity.liveSessionRoots();
      const workspaces = this.deps.activity.registeredWorkspaceRoots();
      if (
        lanes.kind !== 'ok' ||
        sessions.kind !== 'ok' ||
        workspaces.kind !== 'ok'
      ) {
        return { kind: 'unavailable' };
      }
      return {
        kind: 'ok',
        lanes: lanes.value,
        sessions: sessions.value,
        workspaces: workspaces.value,
      };
    } catch (error: unknown) {
      // A host engine threw while listing activity: activity cannot be
      // proved absent, which P10 records as in-use-unverifiable.
      this.deps.logger.debug('[task-end-hook] dispose activity probe failed', {
        error: errorText(error),
      });
      return { kind: 'unavailable' };
    }
  }

  // -------------------------------------------------------------------------
  // Candidate probes
  // -------------------------------------------------------------------------

  private linksFor(
    survey: DisposalRunSurvey,
    worktreePath: string,
    key: string,
    entry: GitWorktreeInfo | null,
    probeErrors: DisposalProbeError[],
  ): DisposalLinks {
    if (!survey.linksComplete || survey.otherTasks.kind === 'error')
      return { kind: 'error' };
    let named: Set<string>;
    try {
      named = new Set(
        this.deps.sessionLinks.taskIdsInWorktreeName(
          worktreePath,
          entry === null ? null : branchOf(entry),
        ),
      );
      if (entry !== null) {
        for (const id of this.deps.sessionLinks.taskIdsInWorktreeName(
          entry.path,
          branchOf(entry),
        )) {
          named.add(id);
        }
      }
    } catch (error: unknown) {
      // The naming rule threw: name links cannot be proved either way.
      probeErrors.push(DISPOSAL_PROBE_ERRORS.worktreeName);
      this.debug('worktree name rule failed', survey.run, error);
      return { kind: 'error' };
    }
    const candidate = survey.candidates.find((item) => item.key === key);
    const sources = candidate?.sources ?? new Set<DisposalLinkSource>();
    const others: string[] = [];
    for (const [taskId, claimed] of survey.otherTasks.claims) {
      if (named.has(taskId) || claimed.has(key)) others.push(taskId);
    }
    return {
      kind: 'ok',
      bySession: sources.has('session'),
      byName: named.has(survey.run.taskId),
      byContextLine: sources.has('context-line'),
      otherNonTerminalTaskIds: others.sort(),
    };
  }

  /** Row 3 in the candidate (only when its directory exists). */
  private async readStatus(realPath: string, signal: AbortSignal) {
    const result = await this.runGit(
      READ_ONLY_GIT_VECTORS.status(),
      realPath,
      STATUS_MAX_BYTES,
      signal,
    );
    if (result === null || result.exitCode !== 0)
      return { kind: 'error' as const };
    return parseGitStatusPorcelainZ(result.stdout);
  }

  /** P7: `<archiveRoot>/<taskId>/<runId>/<slug>`, existence only. */
  private async archiveDestinationOf(
    run: DisposalSurveyRun,
    realPath: string,
  ): Promise<DisposalArchiveDestination> {
    const slug = `${path.basename(realPath)}-${createHash('sha256')
      .update(realPath)
      .digest('hex')
      .slice(0, SLUG_HASH_LENGTH)}`;
    try {
      await fs.lstat(path.join(this.archiveRoot, run.taskId, run.runId, slug));
      return { kind: 'exists' };
    } catch (error: unknown) {
      return isMissing(error) ? { kind: 'absent' } : { kind: 'error' };
    }
  }

  /** P8 rows 4-6 from the main root. A detached HEAD is unverified. */
  private async mergeState(
    survey: DisposalRunSurvey,
    branch: string | null,
    probeErrors: DisposalProbeError[],
    signal: AbortSignal,
  ): Promise<DisposalMerge> {
    if (branch === null) return { kind: 'unverified' };
    const mainRoot = survey.run.mainRoot;

    // Row 4 ran once in the survey; its error code is already recorded.
    if (survey.originMain !== 'present') return { kind: 'unverified' };

    let shaVector: readonly string[];
    try {
      shaVector = READ_ONLY_GIT_VECTORS.branchSha(branch);
    } catch {
      // `assertSafeRef` refused the branch name: the tip cannot be resolved
      // safely, which P8 records as merge-unverified.
      return { kind: 'unverified' };
    }
    const shaResult = await this.runGit(
      shaVector,
      mainRoot,
      REF_PROBE_MAX_BYTES,
      signal,
    );
    if (shaResult === null) {
      probeErrors.push(DISPOSAL_PROBE_ERRORS.branchSha);
      return { kind: 'unverified' };
    }
    const sha = shaResult.stdout.trim();
    if (shaResult.exitCode !== 0 || !FULL_OBJECT_ID.test(sha))
      return { kind: 'unverified' };

    const ancestor = await this.runGit(
      READ_ONLY_GIT_VECTORS.isAncestorOfOriginMain(sha),
      mainRoot,
      REF_PROBE_MAX_BYTES,
      signal,
    );
    if (ancestor === null) {
      probeErrors.push(DISPOSAL_PROBE_ERRORS.mergeBase);
      return { kind: 'unverified' };
    }
    if (ancestor.exitCode === 0) return { kind: 'ancestor' };
    if (ancestor.exitCode === 1) return { kind: 'not-ancestor' };
    return { kind: 'unverified' };
  }

  /** Row 4: exit 0 present, exit 1 absent, anything else an error. */
  private async probeOriginMain(
    mainRoot: string,
    signal: AbortSignal,
  ): Promise<Exclude<OriginMainState, 'not-probed'>> {
    const result = await this.runGit(
      READ_ONLY_GIT_VECTORS.originMain(),
      mainRoot,
      REF_PROBE_MAX_BYTES,
      signal,
    );
    if (result === null) return 'error';
    if (result.exitCode === 0) return 'present';
    return result.exitCode === 1 ? 'absent' : 'error';
  }

  /** Row 7 through `PrStatusPort` (C3: `gh` missing leaves P8 to decide). */
  private async queryOpenPr(
    run: DisposalSurveyRun,
    branch: string,
  ): Promise<DisposalOpenPr> {
    try {
      return await this.deps.prStatus.openPrStatus(run.mainRoot, branch);
    } catch (error: unknown) {
      // The port contract says it never rejects; a broken adapter still
      // cannot pass P9, so the rejection is recorded as an error.
      this.debug('pr status rejected', run, error);
      return { kind: 'error' };
    }
  }

  /**
   * One read-only git call. Resolves `null` when the runner rejected (timeout,
   * output limit, spawn failure); an abort of `signal` is re-thrown so the
   * step leaves the entry pending instead of recording a probe error.
   */
  private async runGit(
    args: readonly string[],
    cwd: string,
    maxOutputBytes: number,
    signal: AbortSignal,
  ) {
    try {
      return await this.deps.git.run(args, cwd, {
        timeoutMs: WORKTREE_GIT_TIMEOUT_MS,
        maxOutputBytes,
        signal,
      });
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      // The probe failed; the caller maps `null` to its unverifiable member.
      this.deps.logger.debug('[task-end-hook] dispose git probe failed', {
        command: args[0],
        error: errorText(error),
      });
      return null;
    }
  }

  private debug(message: string, run: DisposalSurveyRun, error: unknown): void {
    this.deps.logger.debug(`[task-end-hook] dispose ${message}`, {
      runId: run.runId,
      error: errorText(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Whether P2 to P8 pass on the probes gathered so far. P9 to P11 and the
 * probe-error rule are neutralised, so `eligible-report-only` here means the
 * first eight rows hold and asking `gh` can change the outcome.
 */
function passesThroughP8(record: DisposalInputRecord): boolean {
  const dry = decideDisposal({
    ...record,
    openPr: { kind: 'none' },
    activity: { kind: 'ok', lanes: [], sessions: [], workspaces: [] },
    harvestOutcome: 'harvested',
    probeErrors: [],
  });
  return dry.state === 'skipped';
}

function linkRoots(run: DisposalSurveyRun): readonly string[] {
  return run.seenRoot === run.mainRoot
    ? [run.mainRoot]
    : [run.mainRoot, run.seenRoot];
}

/** The checked-out branch, or `null` for a detached HEAD. */
function branchOf(entry: GitWorktreeInfo): string | null {
  return DETACHED_BRANCHES.has(entry.branch) ? null : entry.branch;
}

function harvestOutcomeOf(run: TaskEndRunRecord): DisposalHarvestOutcome {
  const entry = run.steps.find((candidate) => candidate.step === 'harvest');
  if (
    entry === undefined ||
    entry.step !== 'harvest' ||
    entry.outcome.state === 'pending'
  ) {
    return 'pending';
  }
  return entry.outcome.reason;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

async function realpathOrNull(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target);
  } catch {
    // degradation-audit: reported - callers record `null` as a probe-error
    // code (or fall back to the lexical path key), never as a pass.
    return null;
  }
}

/** De-duplication keys: the real path, else the resolved lexical path. */
class PathKeyCache {
  private readonly cache = new Map<string, string>();

  async of(target: string): Promise<string> {
    const cached = this.cache.get(target);
    if (cached !== undefined) return cached;
    const key = (await realpathOrNull(target)) ?? path.resolve(target);
    this.cache.set(target, key);
    return key;
  }
}

/** Candidates in discovery order, merged by key. */
class CandidateSet {
  private readonly byKey = new Map<
    string,
    { worktreePath: string; sources: Set<DisposalLinkSource> }
  >();

  constructor(private readonly keys: PathKeyCache) {}

  async add(worktreePath: string, source: DisposalLinkSource): Promise<void> {
    const key = await this.keys.of(worktreePath);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      existing.sources.add(source);
      return;
    }
    this.byKey.set(key, { worktreePath, sources: new Set([source]) });
  }

  list(): DisposalCandidate[] {
    return [...this.byKey].map(([key, value]) => ({
      worktreePath: value.worktreePath,
      key,
      sources: value.sources,
    }));
  }
}

/** Reads a small regular file without following a symlink at its path. */
async function readSmallFile(
  file: string,
): Promise<string | 'absent' | 'unreadable'> {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.size > MAX_SPEC_FILE_BYTES) return 'unreadable';
    return await fs.readFile(file, 'utf8');
  } catch (error: unknown) {
    return isMissing(error) ? 'absent' : 'unreadable';
  }
}

async function readCarrierFile(
  file: string,
  taskId: string,
): Promise<TaskStatus | 'absent' | 'unparseable'> {
  const raw = await readSmallFile(file);
  if (raw === 'absent') return 'absent';
  if (raw === 'unreadable') return 'unparseable';
  const parsed = parseTaskFile(taskId, raw);
  return parsed.kind === 'task' ? parsed.task.status : 'unparseable';
}

/** P2: this task's carrier in the root it was seen in. */
async function readCarrier(
  seenRoot: string,
  taskId: string,
): Promise<DisposalCarrier> {
  const status = await readCarrierFile(
    path.join(seenRoot, '.ptah', 'specs', taskId, 'task.md'),
    taskId,
  );
  return status === 'absent' || status === 'unparseable'
    ? { kind: 'unparseable' }
    : { kind: 'ok', status };
}

type ContextLine =
  | { readonly kind: 'ok'; readonly path: string | null }
  | { readonly kind: 'error' };

/**
 * P3 (c): the first absolute path token on the first non-blank line after a
 * `## Worktree` heading. Backticks and trailing punctuation around the token
 * are stripped; nothing else is normalised (the path must match exactly).
 */
async function readContextWorktreeLine(
  root: string,
  taskId: string,
): Promise<ContextLine> {
  const raw = await readSmallFile(
    path.join(root, '.ptah', 'specs', taskId, 'context.md'),
  );
  if (raw === 'absent') return { kind: 'ok', path: null };
  if (raw === 'unreadable') return { kind: 'error' };
  return { kind: 'ok', path: worktreeLinePath(raw) };
}

export function worktreeLinePath(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Worktree\s*$/.test(line));
  if (heading === -1) return null;
  for (let i = heading + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) return null;
    for (const raw of line.split(/\s+/)) {
      const token = raw.replace(/^[`'"(]+/, '').replace(/[`'"),.;:]+$/, '');
      if (isAbsoluteToken(token)) return token;
    }
    return null;
  }
  return null;
}

function isAbsoluteToken(token: string): boolean {
  return path.isAbsolute(token) && token.length > 1;
}

async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (error: unknown) {
    if (isMissing(error)) return [];
    throw error;
  }
}

type ResolvedCandidate = {
  readonly dirExists: boolean;
  readonly resolution: DisposalPathResolution;
};

/**
 * P5 inputs: the real path when the candidate exists, otherwise the real
 * path of the nearest existing parent plus the raw lexical segments below it
 * (AC 4.10). Segments are not normalised, so `..` reaches the decision.
 */
async function resolveCandidatePath(
  worktreePath: string,
): Promise<ResolvedCandidate> {
  if (!path.isAbsolute(worktreePath))
    return { dirExists: false, resolution: { kind: 'error' } };
  try {
    const realPath = await fs.realpath(worktreePath);
    const info = await fs.lstat(realPath);
    return {
      dirExists: info.isDirectory(),
      resolution: { kind: 'resolved', realPath },
    };
  } catch (error: unknown) {
    if (!isMissing(error))
      return { dirExists: false, resolution: { kind: 'error' } };
  }

  const root = path.parse(worktreePath).root;
  const rest = worktreePath.slice(root.length);
  const trimmed = rest.endsWith(path.sep) ? rest.slice(0, -1) : rest;
  const segments = trimmed.length === 0 ? [] : trimmed.split(path.sep);
  for (let i = segments.length - 1; i >= 0; i--) {
    const prefix = root + segments.slice(0, i).join(path.sep);
    try {
      const parentRealPath = await fs.realpath(prefix);
      return {
        dirExists: false,
        resolution: {
          kind: 'missing',
          nearestParentRealPath: parentRealPath,
          remainingSegments: segments.slice(i),
        },
      };
    } catch (error: unknown) {
      if (!isMissing(error))
        return { dirExists: false, resolution: { kind: 'error' } };
    }
  }
  return { dirExists: false, resolution: { kind: 'error' } };
}

/** Matches the decision's top-level allow-list rule. */
function isAllowListed(relPath: string): boolean {
  return DISPOSAL_ARCHIVE_ALLOW_LIST.some((entry) => {
    const dir = entry.endsWith('/') ? entry : `${entry}/`;
    return relPath === dir.slice(0, -1) || relPath.startsWith(dir);
  });
}

/**
 * P7 ignored files with sizes. Descends only into ignored directories that
 * are not allow-listed, counts with `lstat` (a symlink counts as itself and
 * is never followed), and stops at `archiveMaxFiles + 1` files or
 * `archiveMaxBytes + 1` bytes: the result is then `truncated`. Directories
 * visited are bounded by the same file cap plus one; beyond it the walk is
 * an `error` (a directory tree that large is not provably small).
 */
async function walkIgnored(
  worktreeRoot: string,
  ignored: readonly GitIgnoredEntry[],
  settings: DisposalCollectorSettings,
): Promise<DisposalIgnoredFiles> {
  const files: DisposalIgnoredFile[] = [];
  const fileCap = settings.archiveMaxFiles + 1;
  const byteCap = settings.archiveMaxBytes + 1;
  let bytes = 0;
  let directories = 0;

  const count = (relPath: string, size: number): boolean => {
    files.push({ relPath, bytes: size });
    bytes += size;
    return files.length >= fileCap || bytes >= byteCap;
  };

  const stack: string[] = [];
  try {
    for (const item of ignored) {
      if (isAllowListed(item.relPath)) continue;
      if (item.isDirectory) {
        stack.push(item.relPath);
        continue;
      }
      const info = await lstatOrNull(path.join(worktreeRoot, item.relPath));
      if (info !== null && count(item.relPath, info.size))
        return { kind: 'truncated' };
    }
    while (stack.length > 0) {
      const relDir = stack.pop() as string;
      directories += 1;
      if (directories > fileCap) return { kind: 'error' };
      let names: string[];
      try {
        names = await fs.readdir(path.join(worktreeRoot, relDir));
      } catch (error: unknown) {
        if (isMissing(error)) continue;
        throw error;
      }
      for (const name of names.sort()) {
        const relPath = `${relDir}/${name}`;
        const info = await lstatOrNull(path.join(worktreeRoot, relPath));
        if (info === null) continue;
        if (info.isDirectory()) {
          stack.push(relPath);
        } else if (count(relPath, info.size)) {
          return { kind: 'truncated' };
        }
      }
    }
  } catch {
    // An entry could not be read (permissions, I/O): the archive size is
    // unknown, which P7 records as precondition-unverifiable.
    return { kind: 'error' };
  }
  return { kind: 'ok', files };
}

/** `lstat`, or `null` when the entry vanished during the walk. */
async function lstatOrNull(target: string) {
  try {
    return await fs.lstat(target);
  } catch (error: unknown) {
    if (isMissing(error)) return null;
    throw error;
  }
}
