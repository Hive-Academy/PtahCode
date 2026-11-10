import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  GIT_SESSION_SCOPE_SOURCE,
  VSCodeService,
  UnavailableGitRootsStore,
  type GitSessionScopeCandidate,
} from '@ptah-extension/core';
import {
  isSameWorkingRoot,
  resolveSessionWorkingRoot,
  GitWindowScopeSchema,
  type GitWindowScope,
  type SessionWorkingRoot,
  type SessionWorkingRootSource,
} from '@ptah-extension/shared';
import { GitBranchesService } from './git-branches.service';
import {
  GitDockMutationGate,
  UNRESOLVED_SCOPE_MESSAGE,
} from './git-dock-mutation-gate';
import { GitReviewService } from './git-review.service';
import { GitRootWatchLeaseService } from './git-root-watch-lease.service';
import { GitStatusService } from './git-status.service';
import { ReviewDiffService } from './review-diff.service';
import { ReviewNavigationService } from './review-navigation.service';
import { GIT_WINDOW_CONTEXT } from '../git-window-context.token';

export type GitDockScopeMode = 'follow-session' | 'pinned';

/** What the git dock is scoped to. */
export interface GitDockScope {
  /** Explanation shown when a removed worktree forced a fallback. */
  readonly fallbackReason?: string | null;
  readonly mode: GitDockScopeMode;
  /** The root every dock read and write uses; null when no folder is open. */
  readonly root: string | null;
  /** Which session candidate won (see `resolveSessionWorkingRoot`). */
  readonly source: SessionWorkingRootSource | null;
  /** The session the scope came from; null for the plain workspace scope. */
  readonly session: {
    readonly tabId: string;
    readonly name: string;
    /** The pinned session's tab was closed; the last root is kept. */
    readonly closed: boolean;
  } | null;
  /** True when the root is not the active workspace folder. */
  readonly isWorktree: boolean;
  /**
   * True while the session's organization record is not loaded: its root is
   * unknown, `root` is null, the services keep their last root and every
   * mutation is refused (`GitDockMutationGate`) until the record arrives.
   */
  readonly unresolved: boolean;
}

/** A candidate's resolution; `unresolved` when its worktree is not known. */
interface CandidateRoot extends SessionWorkingRoot {
  readonly unresolved: boolean;
}

const UNRESOLVED_ROOT: CandidateRoot = {
  root: null,
  source: null,
  unresolved: true,
};

function sameWindowRoot(expected: string | null, actual: string | null): boolean {
  return (expected === null && actual === null) || isSameWorkingRoot(expected, actual);
}

/** A pin: the tab, the workspace it was made in, and its last resolution. */
interface PinnedScope {
  readonly tabId: string;
  readonly workspacePath: string | null;
  readonly name: string;
  readonly last: CandidateRoot;
}

/**
 * Every input of the scope, read in one place. The effect reads them in its
 * TRACKED body and hands this plain snapshot to the untracked reconcile, so a
 * change to any of them — an active-tab switch alone included — re-runs it
 * (TASK_2026_855 D21).
 */
interface ScopeInputs {
  readonly unavailableRoots: readonly string[];
  readonly workspacePath: string | null;
  readonly followEnabled: boolean;
  readonly pinned: PinnedScope | null;
  readonly pinnedCandidate: GitSessionScopeCandidate | null;
  readonly active: GitSessionScopeCandidate | null;
  readonly open: readonly GitSessionScopeCandidate[];
}

interface WorkspaceAwareService {
  switchWorkspace(workspacePath: string): void;
  removeWorkspaceState(workspacePath: string): void;
}

function resolveCandidate(
  candidate: GitSessionScopeCandidate,
  workspacePath: string | null,
  unavailableRoots: readonly string[],
): CandidateRoot {
  // Never guess for a session whose record is not loaded: falling through to
  // the cwd/workspace folder would point stage/commit/discard at the main
  // tree while the session may live in a worktree (review S1).
  if (!candidate.organizationResolved) return UNRESOLVED_ROOT;
  const resolved = resolveSessionWorkingRoot({
    organizationWorktreePath: candidate.organizationWorktreePath,
    agentOriginWorktreePath: candidate.agentOriginWorktreePath,
    sessionCwd: candidate.sessionCwd,
    workspaceRoot: workspacePath,
    unavailableRoots,
  });
  return { ...resolved, unresolved: false };
}

function workspaceScope(
  workspacePath: string | null,
  mode: GitDockScopeMode,
): GitDockScope {
  return {
    mode,
    root: workspacePath,
    source: workspacePath === null ? null : 'workspace-root',
    session: null,
    isWorktree: false,
    unresolved: false,
  };
}

/**
 * The banner text when the candidate's own worktree was refused and the dock
 * fell back. `showsWorktree` is true when the fallback root is itself another
 * worktree (a session cwd), so the text never claims the main repository.
 */
function fallbackReason(
  candidate: GitSessionScopeCandidate | null,
  resolved: CandidateRoot,
  roots: readonly string[],
  showsWorktree: boolean,
): string | undefined {
  if (
    !candidate ||
    (resolved.source !== 'session-cwd' && resolved.source !== 'workspace-root')
  ) {
    return undefined;
  }
  const excluded = [
    candidate.organizationWorktreePath,
    candidate.agentOriginWorktreePath,
  ].some(
    (path) =>
      path !== null && roots.some((root) => isSameWorkingRoot(root, path)),
  );
  if (!excluded) return undefined;
  return showsWorktree
    ? 'Worktree removed. Showing the session folder.'
    : 'Worktree removed. Showing the main repository.';
}

/** Spreads `fallbackReason` only when there is one (keeps sameScope stable). */
function withFallbackReason(
  reason: string | undefined,
): { fallbackReason?: string } {
  return reason === undefined ? {} : { fallbackReason: reason };
}

/** The scope the inputs describe. Pure. */
function scopeFrom(inputs: ScopeInputs): GitDockScope {
  const { workspacePath, pinned } = inputs;
  if (!inputs.followEnabled) {
    return workspaceScope(workspacePath, 'follow-session');
  }
  const isWorktree = (root: string | null): boolean =>
    root !== null &&
    workspacePath !== null &&
    !isSameWorkingRoot(root, workspacePath);

  if (pinned !== null) {
    const candidate = inputs.pinnedCandidate;
    const resolved =
      candidate === null
        ? pinned.last
        : resolveCandidate(candidate, workspacePath, inputs.unavailableRoots);
    return {
      mode: 'pinned',
      root: resolved.root,
      source: resolved.source,
      session: {
        tabId: pinned.tabId,
        name: candidate?.sessionName ?? pinned.name,
        closed: candidate === null,
      },
      isWorktree: isWorktree(resolved.root),
      unresolved: resolved.unresolved,
      ...withFallbackReason(
        fallbackReason(
          candidate,
          resolved,
          inputs.unavailableRoots,
          isWorktree(resolved.root),
        ),
      ),
    };
  }

  const active = inputs.active;
  if (active === null) return workspaceScope(workspacePath, 'follow-session');
  const resolved = resolveCandidate(active, workspacePath, inputs.unavailableRoots);
  return {
    mode: 'follow-session',
    root: resolved.root,
    source: resolved.source,
    session: { tabId: active.tabId, name: active.sessionName, closed: false },
    isWorktree: isWorktree(resolved.root),
    unresolved: resolved.unresolved,
    ...withFallbackReason(
      fallbackReason(
        active,
        resolved,
        inputs.unavailableRoots,
        isWorktree(resolved.root),
      ),
    ),
  };
}

function sameScope(a: GitDockScope, b: GitDockScope): boolean {
  return (
    a.mode === b.mode &&
    a.root === b.root &&
    a.source === b.source &&
    a.isWorktree === b.isWorktree &&
    a.unresolved === b.unresolved &&
    a.fallbackReason === b.fallbackReason &&
    a.session?.tabId === b.session?.tabId &&
    a.session?.name === b.session?.name &&
    a.session?.closed === b.session?.closed
  );
}

/**
 * GitDockScopeStore — decides the root the git dock works in and drives the
 * git services to it (TASK_2026_855).
 *
 * In Electron the dock follows the active chat session's working root
 * (organization worktree → agent-origin worktree → session cwd → workspace
 * folder, `resolveSessionWorkingRoot`), or stays on a pinned session. In
 * every other host, or without a session source, the scope is the workspace
 * folder — today's behaviour.
 *
 * It is the single caller of `switchWorkspace(root)` on GitStatusService,
 * GitBranchesService, ReviewDiffService, GitReviewService and
 * ReviewNavigationService (in that order — navigation last, it reads the
 * status service's new root when it resets). Those services keep one
 * "active root" each, so retargeting them is all it takes for every dock
 * read and write to follow. The fan-out runs only when the root actually
 * changes.
 *
 * The root is not validated here: the backend re-validates every `git:*`
 * root, and a refused one shows the dock's "unavailable" state while this
 * scope stays visible so the user can unpin or switch tabs.
 *
 * Pins live in memory only (D11). A pinned tab that closes keeps its last
 * root, marked closed, until unpinned; a workspace switch or removal clears
 * a pin made in that workspace.
 */
@Injectable({ providedIn: 'root' })
export class GitDockScopeStore {
  private readonly windowContext = inject(GIT_WINDOW_CONTEXT, { optional: true });
  private readonly acknowledgedScope = signal<GitWindowScope | null>(null);
  private applyingWindowScope = false;
  private readonly source = inject(GIT_SESSION_SCOPE_SOURCE, {
    optional: true,
  });
  private readonly vscode = inject(VSCodeService);
  private readonly leases = inject(GitRootWatchLeaseService);
  private readonly gate = inject(GitDockMutationGate);
  private readonly status = inject(GitStatusService);
  private readonly unavailableRootsStore = inject(UnavailableGitRootsStore);
  private readonly unavailableRoots = computed(() => this.unavailableRootsStore.roots().map((entry) => entry.path));
  private readonly services: readonly WorkspaceAwareService[] = [
    inject(GitStatusService),
    inject(GitBranchesService),
    inject(ReviewDiffService),
    inject(GitReviewService),
    // Last: it reads GitStatusService's new root when it resets.
    inject(ReviewNavigationService),
  ];

  private readonly _workspacePath = signal<string | null>(null);
  private readonly _pinned = signal<PinnedScope | null>(null);
  /** The root the services were last switched to. */
  private appliedRoot: string | null = null;
  /**
   * Key of the root list last handed to the lease client. A pinned tab's
   * candidate is re-read on every tab update (streaming included); the lease
   * client only hears about an actual change of the list.
   */
  private leasedKey: string | null = null;

  /** Whether this host follows chat sessions (Electron with a source). */
  readonly followsSessions = computed(
    () => this.source !== null && this.vscode.config().isElectron === true,
  );

  readonly scope = computed<GitDockScope>(() => {
    const resolved = scopeFrom(this.readInputs());
    if (this.windowContext?.role !== 'child') return resolved;
    const accepted = this.acknowledgedScope();
    const unresolved = accepted === null || accepted.unresolved ||
      !sameWindowRoot(accepted.repoRoot, resolved.root);
    return unresolved ? { ...resolved, unresolved: true } : resolved;
  }, {
    equal: sameScope,
  });

  readonly mode = computed<GitDockScopeMode>(() => this.scope().mode);

  constructor() {
    if (this.windowContext?.role === 'child') {
      this.gate.setBlockedReason(UNRESOLVED_SCOPE_MESSAGE);
    }
    effect(() => {
      if (this.status.statusUnavailable() !== 'root-unavailable') return;
      const scope = this.scope();
      if (scope.root === null || (scope.source !== 'organization-worktree' && scope.source !== 'agent-origin-worktree')) return;
      if (!isSameWorkingRoot(this.status.activeWorkspacePath(), scope.root)) return;
      this.unavailableRootsStore.mark(scope.root);
    });
    effect(() => {
      const inputs = this.readInputs();
      this.acknowledgedScope();
      if (this.applyingWindowScope) return;
      untracked(() => this.reconcile(inputs));
    });
  }

  /** Validate and apply one host-assigned snapshot; stale or invalid pushes are ignored. */
  applyWindowScope(payload: unknown): boolean {
    if (this.windowContext?.role !== 'child') return false;
    const parsed = GitWindowScopeSchema.safeParse(payload);
    if (!parsed.success) {
      const previous = this.acknowledgedScope();
      if (previous !== null) this.applyAcknowledgedScope(previous);
      return false;
    }
    const next: GitWindowScope = parsed.data;
    if ((next.mode === 'pinned') !== (next.pinnedTabId !== null)) {
      const previous = this.acknowledgedScope();
      if (previous !== null) this.applyAcknowledgedScope(previous);
      return false;
    }
    const previous = this.acknowledgedScope();
    if (previous !== null && next.sequence <= previous.sequence) return false;
    this.applyAcknowledgedScope(next);
    return true;
  }

  /** Ask the main renderer for a mode change without changing local pin state. */
  async requestWindowMode(pin: boolean): Promise<void> {
    if (this.windowContext?.role !== 'child') return;
    const acknowledged = this.acknowledgedScope();
    if (acknowledged === null) return;
    const tabId = pin ? acknowledged.active?.tabId ?? null : null;
    try {
      const accepted = await this.windowContext.setMode(pin ? 'pinned' : 'follow-session', tabId);
      if (!accepted && this.acknowledgedScope() === acknowledged) this.applyAcknowledgedScope(acknowledged);
    } catch {
      if (this.acknowledgedScope() === acknowledged) this.applyAcknowledgedScope(acknowledged);
    }
  }

  private applyAcknowledgedScope(next: GitWindowScope): void {
    if (this.windowContext?.role !== 'child') return;
    this.applyingWindowScope = true;
    try {
      const oldWorkspace = untracked(this._workspacePath);
      if (next.workspaceRoot === null) {
        if (oldWorkspace !== null) this.removeWorkspace(oldWorkspace);
      } else {
        this.setWorkspace(next.workspaceRoot);
      }
      this.windowContext.applyCandidates(next);
      if (next.mode === 'follow-session') this.unpin();
      else if (next.pinnedTabId !== null && next.pinnedTabId === next.active?.tabId) this.pin();
      else if (next.pinnedTabId !== null) this.showSession(next.pinnedTabId);
      this.acknowledgedScope.set(next);
    } finally {
      this.applyingWindowScope = false;
    }
    this.reconcileNow();
  }

  /** The workspace folder became active (WorkspaceCoordinatorService). */
  setWorkspace(path: string): void {
    const pinned = untracked(this._pinned);
    if (pinned !== null && !isSameWorkingRoot(pinned.workspacePath, path)) {
      this._pinned.set(null);
    }
    this._workspacePath.set(path);
    this.reconcileNow();
  }

  /**
   * A workspace folder was closed (WorkspaceCoordinatorService). Tears the
   * folder down in every git service, clears a pin made in it and, when it
   * was the active one, also releases the session root the services were
   * scoped to.
   */
  removeWorkspace(path: string): void {
    for (const service of this.services) service.removeWorkspaceState(path);
    const pinned = untracked(this._pinned);
    if (pinned !== null && isSameWorkingRoot(pinned.workspacePath, path)) {
      this._pinned.set(null);
    }
    if (isSameWorkingRoot(untracked(this._workspacePath), path)) {
      this._workspacePath.set(null);
      const applied = this.appliedRoot;
      if (applied !== null && !isSameWorkingRoot(applied, path)) {
        for (const service of this.services) {
          service.removeWorkspaceState(applied);
        }
      }
      this.appliedRoot = null;
    }
    this.reconcileNow();
  }

  /** Pin the current session scope: tab switches no longer move the dock. */
  pin(): void {
    const scope = untracked(() => scopeFrom(this.readInputs()));
    if (!untracked(this.followsSessions) || scope.session === null) return;
    this._pinned.set({
      tabId: scope.session.tabId,
      workspacePath: untracked(this._workspacePath),
      name: scope.session.name,
      last: {
        root: scope.root,
        source: scope.source,
        unresolved: scope.unresolved,
      },
    });
    this.reconcileNow();
  }

  /** Return to following the active session. */
  unpin(): void {
    if (untracked(this._pinned) === null) return;
    this._pinned.set(null);
    this.reconcileNow();
  }

  /**
   * Show one session's changes: the active tab's follows (unpins), any other
   * tab's pins the dock to it without switching the chat.
   */
  showSession(tabId: string): void {
    if (!untracked(this.followsSessions) || this.source === null) return;
    const source = this.source;
    if (untracked(source.activeSession)?.tabId === tabId) {
      this.unpin();
      return;
    }
    const candidate = untracked(() => source.candidateForTab(tabId));
    if (candidate === null) return;
    const workspacePath = untracked(this._workspacePath);
    this._pinned.set({
      tabId,
      workspacePath,
      name: candidate.sessionName,
      last: resolveCandidate(candidate, workspacePath, this.unavailableRoots()),
    });
    this.reconcileNow();
  }

  private readInputs(): ScopeInputs {
    const unavailableRoots = this.unavailableRoots();
    const workspacePath = this._workspacePath();
    const followEnabled = this.followsSessions();
    const pinned = this._pinned();
    const source = this.source;
    if (!followEnabled || source === null) {
      return {
        workspacePath,
        followEnabled: false,
        pinned,
        pinnedCandidate: null,
        active: null,
        open: [],
        unavailableRoots,
      };
    }
    return {
      workspacePath,
      followEnabled,
      pinned,
      pinnedCandidate:
        pinned === null ? null : source.candidateForTab(pinned.tabId),
      active: source.activeSession(),
      open: source.openSessions(),
      unavailableRoots,
    };
  }

  private reconcileNow(): void {
    if (this.applyingWindowScope) return;
    const inputs = untracked(() => this.readInputs());
    this.reconcile(inputs);
  }

  /** Apply a snapshot: retarget the services and the leases. Idempotent. */
  private reconcile(inputs: ScopeInputs): void {
    const scope = scopeFrom(inputs);
    this.rememberPinnedRoot(inputs, scope);
    const accepted = untracked(this.acknowledgedScope);
    const childUnresolved = this.windowContext?.role === 'child' &&
      (accepted === null || accepted.unresolved ||
        !sameWindowRoot(accepted.repoRoot, scope.root));
    this.gate.setBlockedReason(scope.unresolved || childUnresolved ? UNRESOLVED_SCOPE_MESSAGE : null);

    const root = scope.root;
    if (root !== null && !isSameWorkingRoot(root, this.appliedRoot)) {
      this.appliedRoot = root;
      for (const service of this.services) service.switchWorkspace(root);
    }

    if (!inputs.followEnabled) return;
    const workspacePath = inputs.workspacePath;
    const sessionRoots = inputs.open
      .map((candidate) => resolveCandidate(candidate, workspacePath, inputs.unavailableRoots).root)
      .filter(
        (candidate): candidate is string =>
          candidate !== null && !isSameWorkingRoot(candidate, workspacePath),
      );
    const leaseRoots = [scope.isWorktree ? root : null, ...sessionRoots];
    const key = leaseRoots.join('\n');
    if (key === this.leasedKey) return;
    this.leasedKey = key;
    this.leases.update(leaseRoots);
  }

  /** Keep the pinned tab's latest root, so a closed tab shows where it was. */
  private rememberPinnedRoot(inputs: ScopeInputs, scope: GitDockScope): void {
    const pinned = inputs.pinned;
    if (pinned === null || inputs.pinnedCandidate === null) return;
    if (
      pinned.last.root === scope.root &&
      pinned.last.source === scope.source &&
      pinned.last.unresolved === scope.unresolved &&
      pinned.name === inputs.pinnedCandidate.sessionName
    ) {
      return;
    }
    this._pinned.set({
      ...pinned,
      name: inputs.pinnedCandidate.sessionName,
      last: {
        root: scope.root,
        source: scope.source,
        unresolved: scope.unresolved,
      },
    });
  }
}
