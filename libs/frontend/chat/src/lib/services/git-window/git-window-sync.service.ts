import { DestroyRef, Injectable, Injector, NgZone, computed, effect, inject, signal, untracked, type Signal } from '@angular/core';
import { ClaudeRpcService, ElectronLayoutService, ThemeService, VSCodeService, type MessageHandler } from '@ptah-extension/core';
import { GIT_WINDOW_PUSH_TYPES, GitWindowEmptyParamsSchema, GitWindowScopeSchema, GitWindowSetModeParamsSchema, type GitWindowMode, type GitWindowScope } from '@ptah-extension/shared';
import { ChatGitSessionScopeSource } from '../session-git-scope/chat-git-session-scope.source';

interface ScopeStore {
  readonly scope: Signal<{ readonly mode: GitWindowMode; readonly root: string | null; readonly session: { readonly tabId: string } | null; readonly unresolved: boolean }>;
  pin(): void;
  unpin(): void;
  showSession(tabId: string): void;
}

/** Main renderer owner of the detachable Git dock and its host assigned scope. */
@Injectable({ providedIn: 'root' })
export class GitWindowSync implements MessageHandler {
  readonly handledMessageTypes = [GIT_WINDOW_PUSH_TYPES.closed, GIT_WINDOW_PUSH_TYPES.setMode] as const;
  private readonly rpc = inject(ClaudeRpcService);
  private readonly layout = inject(ElectronLayoutService);
  private readonly vscode = inject(VSCodeService);
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

  /** Resolve chat scope only when the Git store is active. */
  private get source(): ChatGitSessionScopeSource {
    return this.injector.get(ChatGitSessionScopeSource);
  }

  private readonly scope = computed((): GitWindowScope | null => {
    const store = this.store();
    if (store === null) return null;
    const resolved = store.scope();
    const workspaceRoot = this.layout.activeWorkspace()?.path ?? null;
    const active = this.source.activeSession();
    const open = this.source.openSessions();
    const parsed = GitWindowScopeSchema.safeParse({
      version: 1,
      sequence: 0,
      workspaceRoot,
      repoRoot: resolved.root,
      mode: resolved.mode,
      active,
      pinnedTabId: resolved.mode === 'pinned' ? resolved.session?.tabId ?? null : null,
      open,
      unresolved: resolved.unresolved,
      themeName: this.injector.get(ThemeService).currentTheme(),
    });
    return parsed.success ? parsed.data : null;
  });

  constructor() {
    effect(() => {
      if (!this._detached()) return;
      const scope = this.scope();
      if (scope !== null) untracked(() => void this.publish(scope));
    });
    effect(() => {
      if (!this._detached() || !this.layout.editorPanelVisible()) return;
      untracked(() => {
        this.layout.setEditorPanelVisible(false);
        void this.focus();
      });
    });
    this.destroyRef.onDestroy(() => { this.destroyed = true; });
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
        this._error.set(null);
        return;
      }
      await this.ensureStore();
      const scope = this.scope();
      if (scope === null) throw new Error('Git scope is unavailable');
      const opened = await this.rpc.call('gitWindow:open', {}, { timeout: 10_000 });
      if (!opened.success || !opened.data?.ok) throw new Error('Could not open the Git window');
      if (!(await this.publish(scope, true))) {
        await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
        throw new Error('Could not publish the Git scope');
      }
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
      const previous = store.scope();
      if (mode === 'follow-session') store.unpin();
      else if (tabId === this.source.activeSession()?.tabId) store.pin();
      else if (tabId !== null) store.showSession(tabId);
      const scope = this.scope();
      if (scope !== null && await this.publish(scope)) return;
      if (!this._detached()) return;
      if (previous.mode === 'follow-session') store.unpin();
      else if (previous.session?.tabId === this.source.activeSession()?.tabId) store.pin();
      else if (previous.session !== null) store.showSession(previous.session.tabId);
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
        this._error.set('Could not publish the Git scope');
        return;
      }
      this.lastPublished = key;
      this._error.set(null);
      accepted = true;
    }).catch((error: unknown) => {
      this._error.set(error instanceof Error ? error.message : 'Could not publish the Git scope');
    });
    return this.pending.then(() => accepted);
  }

  private async restoreStatus(): Promise<void> {
    try {
      const result = await this.rpc.call('gitWindow:status', {}, { timeout: 5_000 });
      if (!result.success) {
        this._error.set('Could not check Git window status');
        return;
      }
      if (result.data?.open !== true || this.destroyed) return;
      await this.ensureStore();
      const scope = this.scope();
      if (scope === null || !(await this.publish(scope, true))) {
        await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
        return;
      }
      this.layout.setEditorPanelVisible(false);
      this._detached.set(true);
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : 'Could not restore Git window status');
    }
  }

  private restoreDock(): void {
    this._detached.set(false);
    this.lastPublished = null;
    this.layout.setEditorPanelVisible(true);
    this._error.set(null);
  }
}
