import { DestroyRef, Injectable, Injector, NgZone, computed, effect, inject, signal, untracked, type Signal } from '@angular/core';
import { ClaudeRpcService, ElectronLayoutService, LoggingService, ThemeService, VSCodeService, type MessageHandler } from '@ptah-extension/core';
import { GIT_WINDOW_PUSH_TYPES, GitWindowEmptyParamsSchema, GitWindowScopeSchema, GitWindowSetModeParamsSchema, type GitWindowCandidate, type GitWindowMode, type GitWindowScope } from '@ptah-extension/shared';
import { ChatGitSessionScopeSource } from '../session-git-scope/chat-git-session-scope.source';

interface ScopeStore {
  readonly scope: Signal<{ readonly mode: GitWindowMode; readonly root: string | null; readonly session: { readonly tabId: string } | null; readonly unresolved: boolean }>;
  pin(): void;
  unpin(): void;
  showSession(tabId: string): void;
  /** The pin before a mode change. `restorePin` puts it back, also for a closed tab. */
  pinSnapshot(): unknown;
  restorePin(snapshot: unknown): void;
}

/** Retry of a failed scope publish: 0.5 s, 1 s, 2 s, 4 s, 8 s, 8 s, then Focus must republish. */
const PUBLISH_RETRY_BASE_MS = 500;
const PUBLISH_RETRY_MAX_MS = 8_000;
const PUBLISH_RETRY_LIMIT = 6;

/** The IPC bound of `open` in `GitWindowScopeSchema`. */
const MAX_OPEN_CANDIDATES = 100;
const SCOPE_UNAVAILABLE = 'Git scope is unavailable';
/** Sent when the scope of the main window is not valid: the child shows no repository, not an old one. */
const UNAVAILABLE_SCOPE: GitWindowScope = {
  version: 1, sequence: 0, workspaceRoot: null, repoRoot: null, mode: 'follow-session',
  active: null, pinnedTabId: null, open: [], unresolved: true,
};

/**
 * At most {@link MAX_OPEN_CANDIDATES} open sessions. With more, the tabs the child
 * needs stay: first `tabIds` (active, pinned), then the sessions of `roots`.
 */
export function boundedOpenSessions(
  open: readonly GitWindowCandidate[], tabIds: readonly (string | null)[], roots: readonly (string | null)[],
): readonly GitWindowCandidate[] {
  if (open.length <= MAX_OPEN_CANDIDATES) return open;
  const rank = (c: GitWindowCandidate): number => {
    if (tabIds.includes(c.tabId)) return 0;
    const own = [c.organizationWorktreePath, c.agentOriginWorktreePath, c.sessionCwd];
    return own.some((root) => root !== null && roots.includes(root)) ? 1 : 2;
  };
  // Array.prototype.sort is stable: the order of the source stays in each rank.
  return [...open].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_OPEN_CANDIDATES);
}

/** Main renderer owner of the detachable Git dock and its host assigned scope. */
@Injectable({ providedIn: 'root' })
export class GitWindowSync implements MessageHandler {
  readonly handledMessageTypes = [GIT_WINDOW_PUSH_TYPES.closed, GIT_WINDOW_PUSH_TYPES.setMode] as const;
  private readonly rpc = inject(ClaudeRpcService);
  private readonly layout = inject(ElectronLayoutService);
  private readonly vscode = inject(VSCodeService);
  private readonly logger = inject(LoggingService);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = signal<ScopeStore | null>(null);
  private readonly _detached = signal(false);
  private readonly _error = signal<string | null>(null);
  readonly detached = this._detached.asReadonly();
  readonly error = this._error.asReadonly();
  private lastPublished: string | null = null;
  private pending: Promise<void> = Promise.resolve();
  private destroyed = false;
  /** Incremented when the child closes. An operation that started before it must not set `detached`. */
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryKey: string | null = null;
  private retryAttempt = 0;

  /** Resolve chat scope only when the Git store is active. */
  private get source(): ChatGitSessionScopeSource {
    return this.injector.get(ChatGitSessionScopeSource);
  }

  /** The parse result of the scope to publish. `null`: the Git store is not active. */
  private readonly parsedScope = computed(() => {
    const store = this.store();
    if (store === null) return null;
    const resolved = store.scope();
    const workspaceRoot = this.layout.activeWorkspace()?.path ?? null;
    const active = this.source.activeSession();
    const pinnedTabId = resolved.mode === 'pinned' ? resolved.session?.tabId ?? null : null;
    const open = boundedOpenSessions(
      this.source.openSessions(), [active?.tabId ?? null, pinnedTabId], [resolved.root, workspaceRoot],
    );
    return GitWindowScopeSchema.safeParse({
      version: 1,
      sequence: 0,
      workspaceRoot,
      repoRoot: resolved.root,
      mode: resolved.mode,
      active,
      pinnedTabId,
      open,
      unresolved: resolved.unresolved,
      themeName: this.injector.get(ThemeService).currentTheme(),
    });
  });

  private readonly scope = computed((): GitWindowScope | null => {
    const parsed = this.parsedScope();
    return parsed?.success ? parsed.data : null;
  });

  constructor() {
    effect(() => {
      if (!this._detached()) return;
      const scope = this.scope();
      if (scope !== null) untracked(() => void this.publish(scope));
      else if (this.parsedScope() !== null) untracked(() => this.scopeRejected());
    });
    effect(() => {
      if (!this._detached() || !this.layout.editorPanelVisible()) return;
      untracked(() => {
        this.layout.setEditorPanelVisible(false);
        void this.focus();
      });
    });
    this.destroyRef.onDestroy(() => { this.destroyed = true; this.cancelRetry(); });
    if (this.vscode.isElectron) this.zone.runOutsideAngular(() => void this.restoreStatus());
  }

  private async ensureStore(): Promise<void> {
    if (this.store() !== null) return;
    const git = await import('@ptah-extension/git-ui/services');
    if (!this.destroyed) this.store.set(this.injector.get(git.GitDockScopeStore));
  }

  async detach(): Promise<void> {
    try {
      if (this._detached()) {
        const focused = await this.rpc.call('gitWindow:open', {}, { timeout: 10_000 });
        if (!focused.success || !focused.data?.ok) throw new Error('Could not focus the Git window');
        // The host can open a new child here (a missed closed push), and a failed publish can be unsent.
        const current = this.scope();
        if (current !== null && this._detached() && !(await this.publish(current, true))) {
          throw new Error('Could not publish the Git scope');
        }
        this._error.set(null);
        return;
      }
      await this.ensureStore();
      const scope = this.scope();
      if (scope === null) throw new Error(SCOPE_UNAVAILABLE);
      const token = this.generation;
      const opened = await this.rpc.call('gitWindow:open', {}, { timeout: 10_000 });
      if (!opened.success || !opened.data?.ok) throw new Error('Could not open the Git window');
      if (!(await this.publish(scope, true))) {
        await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
        throw new Error('Could not publish the Git scope');
      }
      if (!(await this.childStillOpen(token, scope))) return;
      this.layout.setEditorPanelVisible(false);
      this._detached.set(true);
      this._error.set(null);
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : 'Could not detach the Git dock');
    }
  }

  async focus(): Promise<void> { await this.detach(); }

  async attach(): Promise<void> {
    try {
      const result = await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
      if (!result.success || !result.data?.closed) throw new Error('Could not close the Git window');
      this.restoreDock();
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : 'Could not attach the Git dock');
    }
  }

  handleMessage(message: { type: string; payload?: unknown }): void {
    if (message.type === GIT_WINDOW_PUSH_TYPES.closed) {
      if (!GitWindowEmptyParamsSchema.safeParse(message.payload === undefined ? {} : message.payload).success) {
        this._error.set('Invalid Git window closed message');
        return;
      }
      this.restoreDock();
      return;
    }
    if (message.type !== GIT_WINDOW_PUSH_TYPES.setMode) return;
    const parsed = GitWindowSetModeParamsSchema.safeParse(message.payload);
    if (!parsed.success ||
        (parsed.data.mode === 'pinned' && parsed.data.tabId === null) ||
        (parsed.data.mode === 'follow-session' && parsed.data.tabId !== null)) {
      this._error.set('Invalid Git window mode message');
      return;
    }
    void this.applyMode(parsed.data.mode, parsed.data.tabId);
  }

  private async applyMode(mode: 'follow-session' | 'pinned', tabId: string | null): Promise<void> {
    try {
      await this.ensureStore();
      const store = this.store();
      if (store === null) return;
      const previous = store.pinSnapshot();
      if (mode === 'follow-session') store.unpin();
      else if (tabId === this.source.activeSession()?.tabId) store.pin();
      else if (tabId !== null) store.showSession(tabId);
      const scope = this.scope();
      if (scope !== null && await this.publish(scope)) return;
      if (!this._detached()) return;
      store.restorePin(previous);
      this._error.set('Could not publish the Git window mode');
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : 'Could not change Git window mode');
    }
  }

  private publish(scope: GitWindowScope, force = false): Promise<boolean> {
    const key = JSON.stringify(scope);
    if (!force && key === this.lastPublished) return Promise.resolve(true);
    let accepted = false;
    this.pending = this.pending.then(async () => {
      if (this.destroyed || (!force && !this._detached())) return;
      if (!force && key === this.lastPublished) { accepted = true; return; }
      const result = await this.rpc.call('gitWindow:publishScope', { scope }, { timeout: 10_000 });
      if (!result.success || !result.data?.accepted || !result.data.scope ||
          !GitWindowScopeSchema.safeParse(result.data.scope).success) {
        this.publishFailed(key, 'Could not publish the Git scope');
        return;
      }
      this.lastPublished = key;
      this._error.set(null);
      this.cancelRetry();
      accepted = true;
    }).catch((error: unknown) => {
      this.publishFailed(key, error instanceof Error ? error.message : 'Could not publish the Git scope');
    });
    return this.pending.then(() => accepted);
  }

  /**
   * The scope of a detached child is not valid for the IPC contract. The update is
   * not dropped in silence: it is logged, the main window shows the error, and the
   * child gets the unavailable scope, so it does not keep the previous repository.
   */
  private scopeRejected(): void {
    const parsed = this.parsedScope();
    if (parsed === null || parsed.success) return;
    this.logger.error('GitWindowSync', 'Git window scope update rejected', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`),
    });
    void this.publish(UNAVAILABLE_SCOPE).then(() => {
      if (this._detached() && this.scope() === null) this._error.set(SCOPE_UNAVAILABLE);
    });
  }

  /** Keep the newest scope pending: while detached, publish it again after a bounded backoff. */
  private publishFailed(key: string, message: string): void {
    this._error.set(message);
    if (this.destroyed || !this._detached()) return;
    if (key !== this.retryKey) {
      this.retryKey = key;
      this.retryAttempt = 0;
    }
    if (this.retryTimer !== null || this.retryAttempt >= PUBLISH_RETRY_LIMIT) return;
    const delay = Math.min(PUBLISH_RETRY_BASE_MS * 2 ** this.retryAttempt, PUBLISH_RETRY_MAX_MS);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.destroyed || !this._detached()) return;
      // The scope is read now, so the retry sends the newest desired scope.
      const scope = this.scope();
      if (scope !== null) void this.publish(scope);
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryKey = null;
    this.retryAttempt = 0;
  }

  /**
   * `true` when the child of this operation is open. A closed push during the
   * awaited work changes `generation`. Then the host is the authority: if a
   * child is open it gets the scope again, and a second close stops the operation.
   */
  private async childStillOpen(token: number, scope: GitWindowScope): Promise<boolean> {
    if (this.destroyed) return false;
    if (token === this.generation) return true;
    const current = this.generation;
    const status = await this.rpc.call('gitWindow:status', {}, { timeout: 5_000 });
    if (!status.success || status.data?.open !== true) return false;
    return (await this.publish(scope, true)) && current === this.generation && !this.destroyed;
  }

  private async restoreStatus(): Promise<void> {
    try {
      const result = await this.rpc.call('gitWindow:status', {}, { timeout: 5_000 });
      if (!result.success) {
        this._error.set('Could not check Git window status');
        return;
      }
      if (result.data?.open !== true || this.destroyed) return;
      const token = this.generation;
      await this.ensureStore();
      const scope = this.scope();
      if (scope === null || !(await this.publish(scope, true))) {
        await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
        return;
      }
      if (!(await this.childStillOpen(token, scope))) return;
      this.layout.setEditorPanelVisible(false);
      this._detached.set(true);
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : 'Could not restore Git window status');
    }
  }

  private restoreDock(): void {
    this.generation += 1;
    this.cancelRetry();
    this._detached.set(false);
    this.lastPublished = null;
    this.layout.setEditorPanelVisible(true);
    this._error.set(null);
  }
}
